class NotificationDeliveryJob < ApplicationJob
  queue_as :default

  def perform(notification_delivery_id)
    delivery = NotificationDelivery.find_by(id: notification_delivery_id)
    return unless delivery
    return unless delivery.queued?

    LeadNotificationService.deliver!(delivery)
  end
end
