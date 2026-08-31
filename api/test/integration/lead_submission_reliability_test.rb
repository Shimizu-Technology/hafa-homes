require "test_helper"

class LeadSubmissionReliabilityTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup do
    @brokerage = create_brokerage(name: "Reliable Realty", slug: "reliable")
    BrokerageDomain.create!(brokerage: @brokerage, hostname: "reliable.test", primary: true)
    @headers = { "X-Brokerage-Host" => "reliable.test" }
    @payload = {
      lead: {
        lead_type: "contact",
        name: "Retrying Buyer",
        email: "buyer@example.com",
        message: "Please tell me more."
      }
    }
    clear_enqueued_jobs
  end

  test "replays an identical submission without duplicating the lead or notification intent" do
    key = SecureRandom.uuid

    assert_difference -> { Lead.count }, 1 do
      assert_difference -> { NotificationDelivery.count }, 1 do
        post "/api/v1/leads", headers: @headers.merge("Idempotency-Key" => key), params: @payload
      end
    end
    assert_response :created
    created_id = response.parsed_body.dig("lead", "id")
    assert_enqueued_jobs 1, only: NotificationDeliveryJob

    assert_no_difference -> { Lead.count } do
      assert_no_difference -> { NotificationDelivery.count } do
        post "/api/v1/leads", headers: @headers.merge("Idempotency-Key" => key), params: @payload
      end
    end

    assert_response :success
    assert_equal "true", response.headers["Idempotency-Replayed"]
    assert_equal true, response.parsed_body.fetch("idempotency_replayed")
    assert_equal created_id, response.parsed_body.dig("lead", "id")
    assert_enqueued_jobs 1, only: NotificationDeliveryJob
  end

  test "rejects reuse of an idempotency key for a different submission" do
    key = SecureRandom.uuid
    post "/api/v1/leads", headers: @headers.merge("Idempotency-Key" => key), params: @payload
    assert_response :created

    assert_no_difference -> { Lead.count } do
      post "/api/v1/leads",
        headers: @headers.merge("Idempotency-Key" => key),
        params: { lead: @payload.fetch(:lead).merge(message: "This is a different request.") }
    end

    assert_response :conflict
    assert_equal [ "Idempotency-Key was already used for a different request" ], response.parsed_body.fetch("errors")
    assert_equal true, response.parsed_body.fetch("reset_idempotency_key")
  end

  test "does not replay a pending key across authenticated users on a shared device" do
    first_user = create_user(email: "first@example.com", clerk_id: "clerk-first")
    second_user = create_user(email: "second@example.com", clerk_id: "clerk-second")
    key = SecureRandom.uuid

    with_singleton_stub(ClerkAuth, :verify, { "sub" => first_user.clerk_id, "email" => first_user.email }) do
      post "/api/v1/leads", headers: @headers.merge("Authorization" => "Bearer first", "Idempotency-Key" => key), params: @payload
    end
    assert_response :created
    first_lead = Lead.order(:id).last
    assert_equal first_user.id, first_lead.user_id

    assert_no_difference -> { Lead.count } do
      with_singleton_stub(ClerkAuth, :verify, { "sub" => second_user.clerk_id, "email" => second_user.email }) do
        post "/api/v1/leads", headers: @headers.merge("Authorization" => "Bearer second", "Idempotency-Key" => key), params: @payload
      end
    end

    assert_response :conflict
    assert_equal true, response.parsed_body.fetch("reset_idempotency_key")
    assert_equal first_user.id, first_lead.reload.user_id
  end

  test "validates idempotency keys before creating a lead" do
    assert_no_difference -> { Lead.count } do
      post "/api/v1/leads", headers: @headers.merge("Idempotency-Key" => "not-a-uuid"), params: @payload
    end

    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("errors"), "Idempotency key is invalid"
    assert_equal true, response.parsed_body.fetch("reset_idempotency_key")
  end

  test "keeps a committed lead and queued delivery when immediate job enqueue fails" do
    original = NotificationDeliveryJob.method(:perform_later)
    NotificationDeliveryJob.define_singleton_method(:perform_later) { |*| raise ActiveJob::EnqueueError, "queue unavailable" }

    assert_difference -> { Lead.count }, 1 do
      assert_difference -> { NotificationDelivery.count }, 1 do
        post "/api/v1/leads", headers: @headers.merge("Idempotency-Key" => SecureRandom.uuid), params: @payload
      end
    end

    assert_response :created
    assert_equal "queued", NotificationDelivery.order(:id).last.status
  ensure
    NotificationDeliveryJob.define_singleton_method(:perform_later, original) if original
  end

  test "rolls back the lead when notification intent persistence fails" do
    original = NotificationDelivery.method(:create!)
    NotificationDelivery.define_singleton_method(:create!) { |*| raise ActiveRecord::StatementInvalid, "database unavailable" }

    assert_no_difference -> { Lead.count } do
      assert_raises(ActiveRecord::StatementInvalid) do
        post "/api/v1/leads", headers: @headers.merge("Idempotency-Key" => SecureRandom.uuid), params: @payload
      end
    end
  ensure
    NotificationDelivery.define_singleton_method(:create!, original) if original
  end

  test "does not turn best-effort CRM activity failure into a false submission failure" do
    original = LeadActivity.method(:record!)
    LeadActivity.define_singleton_method(:record!) { |*| raise ActiveRecord::StatementInvalid, "activity unavailable" }

    assert_difference -> { Lead.count }, 1 do
      post "/api/v1/leads", headers: @headers.merge("Idempotency-Key" => SecureRandom.uuid), params: @payload
    end

    assert_response :created
  ensure
    LeadActivity.define_singleton_method(:record!, original) if original
  end

  test "does not turn best-effort lead audit failure into a false submission failure" do
    original = AuditLogger.method(:record!)
    AuditLogger.define_singleton_method(:record!) { |**| raise ActiveRecord::StatementInvalid, "audit unavailable" }

    assert_difference -> { Lead.count }, 1 do
      post "/api/v1/leads", headers: @headers.merge("Idempotency-Key" => SecureRandom.uuid), params: @payload
    end

    assert_response :created
  ensure
    AuditLogger.define_singleton_method(:record!, original) if original
  end

  test "does not turn best-effort showing audit failure into a false creation failure" do
    admin = create_user(email: "admin@example.com", role: "brokerage_admin", clerk_id: "clerk-admin")
    BrokerageMembership.create!(brokerage: @brokerage, user: admin, role: "brokerage_admin", status: "active")
    lead = Lead.create!(brokerage: @brokerage, lead_type: "showing_request", name: "Showing Buyer", email: "showing@example.com")
    original = AuditLogger.method(:record!)
    AuditLogger.define_singleton_method(:record!) { |**| raise ActiveRecord::StatementInvalid, "audit unavailable" }

    assert_difference -> { ShowingAppointment.count }, 1 do
      with_singleton_stub(ClerkAuth, :verify, { "sub" => admin.clerk_id, "email" => admin.email }) do
        post "/api/v1/showing_appointments",
          headers: @headers.merge("Authorization" => "Bearer admin"),
          params: {
            showing_appointment: {
              lead_id: lead.id,
              scheduled_starts_at: 2.days.from_now,
              scheduled_ends_at: 2.days.from_now + 1.hour,
              status: "confirmed"
            }
          }
      end
    end

    assert_response :created
  ensure
    AuditLogger.define_singleton_method(:record!, original) if original
  end

  test "rolls back a showing and its lead status when notification intent persistence fails" do
    lead = Lead.create!(brokerage: @brokerage, lead_type: "showing_request", name: "Showing Buyer", email: "showing@example.com")
    original = NotificationDelivery.method(:create!)
    NotificationDelivery.define_singleton_method(:create!) { |*| raise ActiveRecord::StatementInvalid, "database unavailable" }

    assert_no_difference [ -> { ShowingAppointment.count }, -> { NotificationDelivery.count } ] do
      assert_raises(ActiveRecord::StatementInvalid) do
        ShowingAppointment.create!(
          lead: lead,
          brokerage: @brokerage,
          scheduled_starts_at: 2.days.from_now,
          scheduled_ends_at: 2.days.from_now + 1.hour,
          status: "confirmed"
        )
      end
    end

    assert_equal "new", lead.reload.status
  ensure
    NotificationDelivery.define_singleton_method(:create!, original) if original
  end
end
