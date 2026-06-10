class NotificationDelivery < ApplicationRecord
  CHANNELS = %w[email sms].freeze
  PROVIDERS = %w[resend clicksend].freeze
  RECIPIENT_ROLES = %w[consumer agent].freeze
  STATUSES = %w[queued sending sent skipped failed].freeze

  belongs_to :lead, optional: true
  belongs_to :showing_appointment, optional: true
  belongs_to :sent_by, class_name: "User", optional: true

  validates :channel, inclusion: { in: CHANNELS }
  validates :provider, inclusion: { in: PROVIDERS }
  validates :recipient_role, inclusion: { in: RECIPIENT_ROLES }
  validates :status, inclusion: { in: STATUSES }
  validates :recipient, :event_name, presence: true

  scope :recent_first, -> { order(created_at: :desc) }

  def sent?
    status == "sent"
  end

  def queued?
    status == "queued"
  end

  def mark_sent!(provider_message_id: nil)
    update!(
      status: "sent",
      provider_message_id: provider_message_id.presence || self.provider_message_id,
      sent_at: Time.current,
      failed_at: nil,
      error_message: nil
    )
  end

  def mark_failed!(message)
    update!(status: "failed", error_message: message.to_s, failed_at: Time.current)
  end

  def mark_skipped!(message)
    update!(status: "skipped", error_message: message.to_s)
  end
end
