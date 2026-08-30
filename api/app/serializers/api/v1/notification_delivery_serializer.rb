module Api
  module V1
    class NotificationDeliverySerializer
      class << self
        def summary(delivery)
          {
            id: delivery.id,
            channel: delivery.channel,
            provider: delivery.provider,
            recipient_role: delivery.recipient_role,
            recipient: recipient_display(delivery),
            event_name: delivery.event_name,
            subject: delivery.metadata["subject"],
            body_preview: delivery.metadata["body"].to_s.truncate(120),
            status: delivery.status,
            attempt_count: delivery.attempt_count,
            error_message: delivery.error_message,
            queued_at: delivery.queued_at,
            last_attempt_at: delivery.last_attempt_at,
            sent_at: delivery.sent_at,
            failed_at: delivery.failed_at,
            created_at: delivery.created_at
          }
        end

        private

        def recipient_display(delivery)
          return delivery.recipient unless delivery.channel == "sms"

          ClicksendClient.mask_phone(delivery.recipient)
        end
      end
    end
  end
end
