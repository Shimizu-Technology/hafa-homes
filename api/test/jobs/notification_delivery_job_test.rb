require "test_helper"

class NotificationDeliveryJobTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  setup do
    brokerage = create_brokerage(name: "Alpha Realty", slug: "alpha")
    @lead = Lead.create!(brokerage: brokerage, lead_type: "contact", name: "Buyer", email: "buyer@example.com")
  end

  test "claims and delivers a queued notification only once" do
    delivery = create_delivery
    calls = 0

    with_delivery_implementation(lambda { |claimed|
      calls += 1
      claimed.mark_sent!(provider_message_id: "provider-123")
    }) do
      NotificationDeliveryJob.perform_now(delivery.id)
      NotificationDeliveryJob.perform_now(delivery.id)
    end

    assert_equal 1, calls
    assert_equal "sent", delivery.reload.status
    assert_equal 1, delivery.attempt_count
    assert_equal "provider-123", delivery.provider_message_id
  end

  test "requeues retryable email failures for Active Job retry" do
    delivery = create_delivery

    with_delivery_implementation(lambda { |_claimed|
      raise LeadNotificationService::RetryableDeliveryError, "provider unavailable"
    }) do
      assert_enqueued_with(job: NotificationDeliveryJob, args: [ delivery.id ]) do
        NotificationDeliveryJob.perform_now(delivery.id)
      end
    end

    assert_equal "queued", delivery.reload.status
    assert_equal 1, delivery.attempt_count
    assert_equal "provider unavailable", delivery.error_message
    assert_in_delta Time.current, delivery.queued_at, 2.seconds
  end

  test "marks a delivery failed when retryable errors exhaust the retry limit" do
    delivery = create_delivery

    with_delivery_implementation(lambda { |_claimed|
      raise LeadNotificationService::RetryableDeliveryError, "provider remained unavailable"
    }) do
      perform_enqueued_jobs do
        NotificationDeliveryJob.perform_later(delivery.id)
      end
    end

    assert_equal "failed", delivery.reload.status
    assert_equal 5, delivery.attempt_count
    assert_equal "provider remained unavailable", delivery.error_message
  end

  private

  def create_delivery(channel: "email", status: "queued", queued_at: Time.current)
    NotificationDelivery.create!(
      lead: @lead,
      channel: channel,
      provider: channel == "email" ? "resend" : "clicksend",
      recipient_role: "consumer",
      recipient: channel == "email" ? @lead.email : "+16715550101",
      event_name: "manual_update",
      status: status,
      queued_at: queued_at
    )
  end

  def with_delivery_implementation(implementation)
    original = LeadNotificationService.method(:deliver!)
    LeadNotificationService.define_singleton_method(:deliver!, &implementation)
    yield
  ensure
    LeadNotificationService.define_singleton_method(:deliver!, original)
  end
end
