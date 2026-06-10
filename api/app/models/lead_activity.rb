class LeadActivity < ApplicationRecord
  ACTIONS = %w[
    lead_created
    lead_updated
    note_added
    task_created
    task_completed
    task_reopened
    showing_updated
    notification_queued
    notification_sent
    notification_failed
    notification_skipped
  ].freeze

  belongs_to :lead
  belongs_to :actor, class_name: "User", optional: true
  belongs_to :subject, polymorphic: true, optional: true

  validates :action, presence: true
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

  private

  def set_defaults
    self.occurred_at ||= Time.current
    self.metadata ||= {}
  end
end
