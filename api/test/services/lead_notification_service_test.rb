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

    assert_includes html, "https://alpha.test/open?target=%2Faccount%2Frequests"
    assert_includes sms, "https://alpha.test/open?target=%2Faccount%2Frequests"
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

    assert_includes html, "https://fallback.test/open?target=%2Faccount%2Frequests"
  ensure
    previous ? ENV["FRONTEND_URL"] = previous : ENV.delete("FRONTEND_URL")
  end

  test "email delivery uses a stable provider idempotency key" do
    brokerage = create_brokerage(name: "Alpha Realty", slug: "alpha")
    lead = Lead.create!(brokerage: brokerage, lead_type: "contact", name: "Buyer", email: "buyer@example.com")
    delivery = LeadNotificationService.queue_manual(lead, channel: "email", recipient_role: "consumer")
    captured_options = nil
    original_send = Resend::Emails.method(:send)
    original_env = notification_env
    configure_email_notifications
    Resend::Emails.define_singleton_method(:send) do |_payload, options:|
      captured_options = options
      { "id" => "resend-123" }
    end

    LeadNotificationService.deliver!(delivery)

    assert_equal({ idempotency_key: "notification-delivery/#{delivery.id}" }, captured_options)
    assert_equal "sent", delivery.reload.status
    assert_equal "resend-123", delivery.provider_message_id
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
