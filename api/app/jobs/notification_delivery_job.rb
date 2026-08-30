class NotificationDeliveryJob < ApplicationJob
  queue_as :default

  retry_on LeadNotificationService::RetryableDeliveryError, wait: :polynomially_longer, attempts: 5 do |job, error|
    delivery = NotificationDelivery.find_by(id: job.arguments.first)
    delivery&.mark_failed!(error.message) unless delivery&.sent? || delivery&.status == "skipped"
  end

  discard_on ActiveRecord::RecordNotFound

  def perform(notification_delivery_id)
    delivery = NotificationDelivery.find(notification_delivery_id)
    return unless delivery.claim_for_delivery!

    LeadNotificationService.deliver!(delivery)
  rescue LeadNotificationService::RetryableDeliveryError => e
    delivery&.requeue_for_retry!(e.message)
    raise
  end
end
