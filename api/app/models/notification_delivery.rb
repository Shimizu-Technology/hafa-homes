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
  after_create_commit :enqueue_delivery, if: :queued?
  after_update_commit :record_delivery_status_activity, if: :saved_change_to_status?

  validates :channel, inclusion: { in: CHANNELS }
  validates :provider, inclusion: { in: PROVIDERS }
  validates :recipient_role, inclusion: { in: RECIPIENT_ROLES }
  validates :status, inclusion: { in: STATUSES }
  validates :recipient, :event_name, presence: true

  scope :recent_first, -> { order(created_at: :desc) }
  scope :queued_before, ->(time) { where(status: "queued").where("COALESCE(queued_at, created_at) <= ?", time) }
  scope :sending_before, ->(time) { where(status: "sending").where(updated_at: ..time) }

  def sent?
    status == "sent"
  end

  def queued?
    status == "queued"
  end

  def claim_for_delivery!
    claimed = self.class
      .where(id: id, status: "queued")
      .update_all([ "status = 'sending', attempt_count = attempt_count + 1, last_attempt_at = ?, updated_at = ?", Time.current, Time.current ])
    reload if claimed == 1
    claimed == 1
  end

  def requeue_for_retry!(message)
    requeued = self.class
      .where(id: id, status: "sending")
      .update_all(status: "queued", error_message: message.to_s, failed_at: nil, queued_at: Time.current, updated_at: Time.current)
    reload if requeued == 1
    requeued == 1
  end

  def recover_interrupted!(cutoff:)
    with_lock do
      return false unless status == "sending" && updated_at <= cutoff

      if channel == "email"
        update!(status: "queued", error_message: "Recovered an interrupted email delivery", failed_at: nil, queued_at: Time.current)
      else
        mark_failed!("Delivery was interrupted with an unknown provider outcome; review before resending")
      end
    end
    true
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
    update!(status: "skipped", error_message: message.to_s, failed_at: nil)
  end

  private

  def record_queued_activity
    metadata = { channel: channel, recipient_role: recipient_role, event_name: event_name }

    LeadActivity.record!(
      lead: lead,
      action: "notification_queued",
      actor: sent_by,
      subject: self,
      summary: "#{channel.humanize} queued to #{recipient_role}",
      metadata: metadata
    )

    AuditLogger.record!(
      action: "notification_queued",
      actor: sent_by,
      target: self,
      lead: lead,
      metadata: metadata
    )
  rescue StandardError => e
    Rails.logger.warn("Unable to record queued activity for notification delivery #{id}: #{e.class} #{e.message}")
  end

  def record_delivery_status_activity
    action = case status
             when "sent" then "notification_sent"
             when "failed" then "notification_failed"
             when "skipped" then "notification_skipped"
             end
    return unless action

    metadata = { channel: channel, recipient_role: recipient_role, event_name: event_name, error_message: error_message }

    LeadActivity.record!(
      lead: lead,
      action: action,
      actor: sent_by,
      subject: self,
      summary: "#{channel.humanize} #{status} for #{recipient_role}",
      metadata: metadata
    )

    AuditLogger.record!(
      action: action,
      actor: sent_by,
      target: self,
      lead: lead,
      metadata: metadata
    )
  rescue StandardError => e
    Rails.logger.warn("Unable to record status activity for notification delivery #{id}: #{e.class} #{e.message}")
  end

  def enqueue_delivery
    NotificationDeliveryJob.perform_later(id)
  rescue StandardError => e
    Rails.logger.warn("Notification delivery #{id} is durable but could not be enqueued immediately: #{e.class} #{e.message}")
  end
end
