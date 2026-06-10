class NotificationDelivery < ApplicationRecord
  CHANNELS = %w[email sms].freeze
  PROVIDERS = %w[resend clicksend].freeze
  RECIPIENT_ROLES = %w[consumer agent].freeze
  STATUSES = %w[queued sending sent skipped failed].freeze

  belongs_to :lead, optional: true
  belongs_to :showing_appointment, optional: true
  belongs_to :sent_by, class_name: "User", optional: true
  has_many :lead_activities, as: :subject, dependent: :nullify

  after_create_commit :record_queued_activity
  after_update_commit :record_delivery_status_activity, if: :saved_change_to_status?

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

  private

  def record_queued_activity
    LeadActivity.record!(
      lead: lead,
      action: "notification_queued",
      actor: sent_by,
      subject: self,
      summary: "#{channel.humanize} queued to #{recipient_role}",
      metadata: { channel: channel, recipient_role: recipient_role, event_name: event_name }
    )
  end

  def record_delivery_status_activity
    action = case status
             when "sent" then "notification_sent"
             when "failed" then "notification_failed"
             when "skipped" then "notification_skipped"
             end
    return unless action

    LeadActivity.record!(
      lead: lead,
      action: action,
      actor: sent_by,
      subject: self,
      summary: "#{channel.humanize} #{status} for #{recipient_role}",
      metadata: { channel: channel, recipient_role: recipient_role, event_name: event_name, error_message: error_message }
    )
  end
end
