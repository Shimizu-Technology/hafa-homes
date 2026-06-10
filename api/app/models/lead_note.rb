class LeadNote < ApplicationRecord
  VISIBILITIES = %w[internal].freeze

  attr_accessor :activity_actor

  belongs_to :lead
  belongs_to :author, class_name: "User", optional: true
  belongs_to :archived_by, class_name: "User", optional: true

  validates :body, presence: true
  validates :visibility, inclusion: { in: VISIBILITIES }

  before_validation :set_defaults
  after_create_commit :record_activity
  after_update_commit :record_updated_activity, if: :saved_change_to_body?
  after_update_commit :record_archived_activity, if: :saved_change_to_archived_at?

  scope :active, -> { where(archived_at: nil) }
  scope :archived, -> { where.not(archived_at: nil) }
  scope :recent_first, -> { order(created_at: :desc) }

  def archived?
    archived_at.present?
  end

  private

  def set_defaults
    self.visibility ||= "internal"
  end

  def record_activity
    LeadActivity.record!(
      lead: lead,
      action: "note_added",
      actor: author,
      subject: self,
      summary: "Note added",
      metadata: { body_preview: body.to_s.truncate(140) }
    )
  end

  def record_updated_activity
    LeadActivity.record!(
      lead: lead,
      action: "note_updated",
      actor: activity_actor || author,
      subject: self,
      summary: "Note updated",
      metadata: {
        changes: LeadActivity.change_details(previous_changes, %w[body]),
        body_preview: body.to_s.truncate(140)
      }
    )
  end

  def record_archived_activity
    return unless archived?

    LeadActivity.record!(
      lead: lead,
      action: "note_archived",
      actor: activity_actor || archived_by,
      subject: self,
      summary: "Note archived",
      metadata: { body_preview: body.to_s.truncate(140) }
    )
  end
end
