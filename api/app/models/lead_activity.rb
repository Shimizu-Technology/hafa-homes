class LeadActivity < ApplicationRecord
  ACTIONS = %w[
    lead_created
    lead_updated
    note_added
    note_updated
    note_archived
    task_created
    task_updated
    task_completed
    task_reopened
    task_archived
    showing_updated
    notification_queued
    notification_sent
    notification_failed
    notification_skipped
  ].freeze

  belongs_to :lead
  belongs_to :actor, class_name: "User", optional: true
  belongs_to :subject, polymorphic: true, optional: true

  validates :action, presence: true, inclusion: { in: ACTIONS }
  validates :occurred_at, presence: true

  before_validation :set_defaults

  scope :recent_first, -> { order(occurred_at: :desc, created_at: :desc) }

  def self.record!(lead:, action:, actor: nil, subject: nil, summary: nil, metadata: {})
    return unless lead

    create!(
      lead: lead,
      actor: actor,
      subject: subject,
      action: action,
      summary: summary,
      metadata: metadata.compact,
      occurred_at: Time.current
    )
  end

  def self.change_details(changes, fields)
    Array(fields).filter_map do |field|
      values = changes[field.to_s]
      next unless values

      before, after = values
      next if before == after

      {
        field: field.to_s,
        label: field.to_s.humanize,
        from: serialize_change_value(before),
        to: serialize_change_value(after)
      }
    end
  end

  def self.serialize_change_value(value)
    return nil if value.nil?
    return value.iso8601 if value.respond_to?(:iso8601)
    return value.to_s("F") if value.is_a?(BigDecimal)
    return value.truncate(240) if value.is_a?(String)

    value
  end

  private

  def set_defaults
    self.occurred_at ||= Time.current
    self.metadata ||= {}
  end
end
