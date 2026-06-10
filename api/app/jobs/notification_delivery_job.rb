class NotificationDeliveryJob < ApplicationJob
  queue_as :default

  def perform(notification_delivery_id)
    claimed = NotificationDelivery
      .where(id: notification_delivery_id, status: "queued")
      .update_all(status: "sending", updated_at: Time.current)
    return unless claimed == 1

    delivery = NotificationDelivery.find(notification_delivery_id)
    LeadNotificationService.deliver!(delivery)
  end
end
