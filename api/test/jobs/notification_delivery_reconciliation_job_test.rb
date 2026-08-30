require "test_helper"

class NotificationDeliveryReconciliationJobTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  test "recovers stale email sends without risking duplicate SMS delivery" do
    now = Time.current
    brokerage = create_brokerage(name: "Alpha Realty", slug: "alpha")
    lead = Lead.create!(brokerage: brokerage, lead_type: "contact", name: "Buyer", email: "buyer@example.com")
    stale_email = create_delivery(lead:, channel: "email", status: "sending", queued_at: 30.minutes.before(now), updated_at: 20.minutes.before(now))
    stale_sms = create_delivery(lead:, channel: "sms", status: "sending", queued_at: 30.minutes.before(now), updated_at: 20.minutes.before(now))
    orphaned = create_delivery(lead:, channel: "email", status: "queued", queued_at: 20.minutes.before(now))
    fresh = create_delivery(lead:, channel: "email", status: "queued", queued_at: now)
    clear_enqueued_jobs

    assert_enqueued_with(job: NotificationDeliveryJob, args: [ stale_email.id ]) do
      assert_enqueued_with(job: NotificationDeliveryJob, args: [ orphaned.id ]) do
        NotificationDeliveryReconciliationJob.perform_now(now: now)
      end
    end

    assert_equal "queued", stale_email.reload.status
    assert_in_delta Time.current, stale_email.queued_at, 2.seconds
    assert_equal "failed", stale_sms.reload.status
    assert_includes stale_sms.error_message, "unknown provider outcome"
    assert_equal "queued", fresh.reload.status
    assert_not enqueued_jobs.any? { |job| job.fetch("arguments", []).include?(fresh.id) }
  end

  private

  def create_delivery(lead:, channel:, status:, queued_at:, updated_at: queued_at)
    delivery = NotificationDelivery.create!(
      lead: lead,
      channel: channel,
      provider: channel == "email" ? "resend" : "clicksend",
      recipient_role: "consumer",
      recipient: channel == "email" ? lead.email : "+16715550101",
      event_name: "manual_update",
      status: status,
      queued_at: queued_at
    )
    delivery.update_columns(updated_at: updated_at)
    delivery
  end
end
