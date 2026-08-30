require "test_helper"

class LeadNotificationServiceTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  test "consumer email and SMS links use the lead brokerage primary domain" do
    brokerage = create_brokerage(name: "Alpha Realty", slug: "alpha")
    BrokerageDomain.create!(brokerage: brokerage, hostname: "secondary.alpha.test", status: "active")
    BrokerageDomain.create!(brokerage: brokerage, hostname: "alpha.test", status: "active", primary: true)
    lead = Lead.create!(brokerage: brokerage, lead_type: "contact", name: "Buyer", email: "buyer@example.com", phone: "6715550101")
    delivery = LeadNotificationService.queue_manual(
      lead,
      channel: "email",
      recipient_role: "consumer",
      subject: "Update",
      body: "Your request changed."
    )
    sms_delivery = LeadNotificationService.queue_manual(
      lead,
      channel: "sms",
      recipient_role: "consumer",
      event_name: "showing_update"
    )

    html = LeadNotificationService.send(:email_html, delivery)
    sms = LeadNotificationService.send(:sms_body, sms_delivery)

    assert_includes html, "https://alpha.test/account/requests/#{lead.id}"
    assert_includes sms, "https://alpha.test/account/requests/#{lead.id}"
    refute_includes html, "/open?target="
  end

  test "notification links fall back to configured frontend URL without a brokerage domain" do
    brokerage = create_brokerage(name: "Alpha Realty", slug: "alpha")
    lead = Lead.create!(brokerage: brokerage, lead_type: "contact", name: "Buyer", email: "buyer@example.com")
    delivery = LeadNotificationService.queue_manual(
      lead,
      channel: "email",
      recipient_role: "consumer",
      subject: "Update",
      body: "Your request changed."
    )

    previous = ENV["FRONTEND_URL"]
    ENV["FRONTEND_URL"] = "https://fallback.test"
    html = LeadNotificationService.send(:email_html, delivery)

    assert_includes html, "https://fallback.test/account/requests/#{lead.id}"
  ensure
    previous ? ENV["FRONTEND_URL"] = previous : ENV.delete("FRONTEND_URL")
  end

  test "manual consumer SMS bodies include the exact request link" do
    brokerage = create_brokerage(name: "Alpha Realty", slug: "alpha")
    BrokerageDomain.create!(brokerage: brokerage, hostname: "alpha.test", status: "active", primary: true)
    lead = Lead.create!(brokerage: brokerage, lead_type: "contact", name: "Buyer", email: "buyer@example.com", phone: "6715550101")
    delivery = LeadNotificationService.queue_manual(
      lead,
      channel: "sms",
      recipient_role: "consumer",
      body: "Your showing time changed."
    )

    sms = LeadNotificationService.send(:sms_body, delivery)

    assert_includes sms, "Your showing time changed."
    assert_includes sms, "https://alpha.test/account/requests/#{lead.id}"
  end

  test "manual agent SMS bodies include the staff lead link" do
    brokerage = create_brokerage(name: "Alpha Realty", slug: "alpha")
    BrokerageDomain.create!(brokerage: brokerage, hostname: "alpha.test", status: "active", primary: true)
    agent = Agent.create!(brokerage: brokerage, name: "Alpha Agent", email: "agent@alpha.test", phone: "6715550102")
    lead = Lead.create!(
      brokerage: brokerage,
      assigned_agent: agent,
      lead_type: "contact",
      name: "Buyer",
      email: "buyer@example.com"
    )
    delivery = LeadNotificationService.queue_manual(
      lead,
      channel: "sms",
      recipient_role: "agent",
      body: "A buyer replied."
    )

    sms = LeadNotificationService.send(:sms_body, delivery)

    assert_includes sms, "A buyer replied."
    assert_includes sms, "https://alpha.test/admin/leads/#{lead.id}"
    refute_includes sms, "/account/requests"
  end

  test "email delivery uses a stable provider idempotency key" do
    brokerage = create_brokerage(name: "Alpha Realty", slug: "alpha")
    lead = Lead.create!(brokerage: brokerage, lead_type: "contact", name: "Buyer", email: "buyer@example.com")
    delivery = LeadNotificationService.queue_manual(lead, channel: "email", recipient_role: "consumer", subject: "Update")
    captured_options = nil
    original_send = Resend::Emails.method(:send)
    original_env = notification_env
    configure_email_notifications
    Resend::Emails.define_singleton_method(:send) do |_payload, options:|
      captured_options = options
      { "id" => "resend-123" }
    end

    LeadNotificationService.deliver!(delivery)

    assert_match(/\Anotification-delivery\/#{delivery.id}\/[0-9a-f]{32}\z/, captured_options[:idempotency_key])
    assert_equal "sent", delivery.reload.status
    assert_equal "resend-123", delivery.provider_message_id
    assert_equal "Update", delivery.metadata.dig("email_payload", "subject")
  ensure
    Resend::Emails.define_singleton_method(:send, original_send) if original_send
    restore_notification_env(original_env) if original_env
  end

  test "email provider failures remain retryable instead of becoming terminal immediately" do
    brokerage = create_brokerage(name: "Alpha Realty", slug: "alpha")
    lead = Lead.create!(brokerage: brokerage, lead_type: "contact", name: "Buyer", email: "buyer@example.com")
    delivery = LeadNotificationService.queue_manual(lead, channel: "email", recipient_role: "consumer")
    original_send = Resend::Emails.method(:send)
    original_env = notification_env
    configure_email_notifications
    Resend::Emails.define_singleton_method(:send) { |*, **| raise Timeout::Error, "timeout" }

    error = assert_raises(LeadNotificationService::RetryableDeliveryError) do
      LeadNotificationService.deliver!(delivery)
    end

    assert_includes error.message, "Timeout::Error"
    assert_equal "queued", delivery.reload.status
  ensure
    Resend::Emails.define_singleton_method(:send, original_send) if original_send
    restore_notification_env(original_env) if original_env
  end

  test "email validation failures are terminal and do not enqueue retries" do
    brokerage = create_brokerage(name: "Alpha Realty", slug: "alpha")
    lead = Lead.create!(brokerage: brokerage, lead_type: "contact", name: "Buyer", email: "buyer@example.com")
    delivery = LeadNotificationService.queue_manual(lead, channel: "email", recipient_role: "consumer")
    clear_enqueued_jobs
    original_send = Resend::Emails.method(:send)
    original_env = notification_env
    configure_email_notifications
    Resend::Emails.define_singleton_method(:send) do |*, **|
      raise Resend::Error::InvalidRequestError.new("recipient is invalid", 422)
    end

    assert_no_enqueued_jobs do
      NotificationDeliveryJob.perform_now(delivery.id)
    end

    assert_equal "failed", delivery.reload.status
    assert_equal 1, delivery.attempt_count
    assert_includes delivery.error_message, "recipient is invalid"
  ensure
    Resend::Emails.define_singleton_method(:send, original_send) if original_send
    restore_notification_env(original_env) if original_env
  end

  test "email idempotency keys change when the persisted payload changes" do
    brokerage = create_brokerage(name: "Alpha Realty", slug: "alpha")
    lead = Lead.create!(brokerage: brokerage, lead_type: "contact", name: "Buyer", email: "buyer@example.com")
    delivery = LeadNotificationService.queue_manual(lead, channel: "email", recipient_role: "consumer")
    first_payload = { from: "sender@example.com", to: delivery.recipient, subject: "First", html: "<p>First</p>" }
    changed_payload = first_payload.merge(subject: "Changed")

    first_key = LeadNotificationService.send(:email_idempotency_key, delivery, first_payload)
    changed_key = LeadNotificationService.send(:email_idempotency_key, delivery, changed_payload)

    assert_not_equal first_key, changed_key
  end

  test "classifies Resend idempotency conflicts by retry safety" do
    invalid = Resend::Error.new("invalid_idempotent_request", 409)
    concurrent = Resend::Error.new("concurrent_idempotent_requests", 409)
    unavailable = Resend::Error.new("service unavailable", 503)

    assert_not LeadNotificationService.send(:retryable_resend_error?, invalid)
    assert LeadNotificationService.send(:retryable_resend_error?, concurrent)
    assert LeadNotificationService.send(:retryable_resend_error?, unavailable)
  end

  test "retries reuse the persisted email payload and idempotency key" do
    brokerage = create_brokerage(name: "Alpha Realty", slug: "alpha")
    lead = Lead.create!(brokerage: brokerage, lead_type: "contact", name: "Original Buyer", email: "buyer@example.com")
    delivery = LeadNotificationService.queue_manual(lead, channel: "email", recipient_role: "consumer")
    calls = []
    original_send = Resend::Emails.method(:send)
    original_env = notification_env
    configure_email_notifications
    Resend::Emails.define_singleton_method(:send) do |payload, options:|
      calls << [ payload, options ]
      raise Timeout::Error, "timeout" if calls.one?

      { "id" => "resend-retry" }
    end

    assert_raises(LeadNotificationService::RetryableDeliveryError) do
      LeadNotificationService.deliver!(delivery)
    end
    lead.update!(name: "Changed Buyer")
    LeadNotificationService.deliver!(delivery.reload)

    assert_equal calls.first, calls.second
    assert_equal "sent", delivery.reload.status
  ensure
    Resend::Emails.define_singleton_method(:send, original_send) if original_send
    restore_notification_env(original_env) if original_env
  end

  test "local persistence failures after provider acceptance are terminal" do
    brokerage = create_brokerage(name: "Alpha Realty", slug: "alpha")
    lead = Lead.create!(brokerage: brokerage, lead_type: "contact", name: "Buyer", email: "buyer@example.com")
    delivery = LeadNotificationService.queue_manual(lead, channel: "email", recipient_role: "consumer")
    clear_enqueued_jobs
    original_send = Resend::Emails.method(:send)
    original_mark_sent = delivery.method(:mark_sent!)
    original_env = notification_env
    configure_email_notifications
    Resend::Emails.define_singleton_method(:send) { |*, **| { "id" => "resend-accepted" } }
    delivery.define_singleton_method(:mark_sent!) { |**| raise ActiveRecord::StatementInvalid, "write failed" }

    assert_no_enqueued_jobs do
      LeadNotificationService.deliver!(delivery)
    end

    assert_equal "failed", delivery.reload.status
    assert_includes delivery.error_message, "Local email delivery failure"
  ensure
    Resend::Emails.define_singleton_method(:send, original_send) if original_send
    delivery&.define_singleton_method(:mark_sent!, original_mark_sent) if original_mark_sent
    restore_notification_env(original_env) if original_env
  end

  private

  def notification_env
    %w[EMAIL_NOTIFICATIONS_ENABLED RESEND_API_KEY RESEND_FROM_EMAIL].to_h { |key| [ key, ENV[key] ] }
  end

  def configure_email_notifications
    ENV["EMAIL_NOTIFICATIONS_ENABLED"] = "true"
    ENV["RESEND_API_KEY"] = "test-key"
    ENV["RESEND_FROM_EMAIL"] = "Hafa Homes <noreply@example.com>"
  end

  def restore_notification_env(values)
    values.each { |key, value| value ? ENV[key] = value : ENV.delete(key) }
  end
end
