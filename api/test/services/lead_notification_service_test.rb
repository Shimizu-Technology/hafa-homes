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
end
