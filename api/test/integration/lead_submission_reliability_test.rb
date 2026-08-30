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
  end

  test "validates idempotency keys before creating a lead" do
    assert_no_difference -> { Lead.count } do
      post "/api/v1/leads", headers: @headers.merge("Idempotency-Key" => "not-a-uuid"), params: @payload
    end

    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("errors"), "Idempotency key is invalid"
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

  test "rolls back a showing and its lead status when notification intent persistence fails" do
    lead = Lead.create!(brokerage: @brokerage, lead_type: "showing_request", name: "Showing Buyer", email: "showing@example.com")
    original = NotificationDelivery.method(:create!)
    NotificationDelivery.define_singleton_method(:create!) { |*| raise ActiveRecord::StatementInvalid, "database unavailable" }

    assert_no_difference -> { ShowingAppointment.count } do
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
    assert_equal 0, NotificationDelivery.where(showing_appointment_id: nil, lead: lead).count
  ensure
    NotificationDelivery.define_singleton_method(:create!, original) if original
  end
end
