class LeadNote < ApplicationRecord
  VISIBILITIES = %w[internal].freeze

  belongs_to :lead
  belongs_to :author, class_name: "User", optional: true

  validates :body, presence: true
  validates :visibility, inclusion: { in: VISIBILITIES }

  before_validation :set_defaults
  after_create_commit :record_activity

  scope :recent_first, -> { order(created_at: :desc) }

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
end
