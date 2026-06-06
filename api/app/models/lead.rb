class Lead < ApplicationRecord
  STATUSES = %w[new contacted showing_scheduled nurturing closed lost spam archived].freeze
  QUALITY_STATUSES = %w[unknown verified unverified duplicate spam].freeze

  belongs_to :listing, optional: true
  belongs_to :user, optional: true
  belongs_to :brokerage, optional: true
  belongs_to :assigned_agent, class_name: "Agent", optional: true, inverse_of: :assigned_leads

  validates :lead_type, :name, :email, presence: true
  validates :status, inclusion: { in: STATUSES }
  validates :quality_status, inclusion: { in: QUALITY_STATUSES }

  before_validation :set_defaults
  before_validation :infer_routing_from_listing

  private

  def set_defaults
    self.status ||= "new"
    self.quality_status ||= "unknown"
    self.lead_source ||= "hafa_homes"
  end

  def infer_routing_from_listing
    return unless new_record? && listing

    self.brokerage ||= listing.brokerage
    self.assigned_agent ||= listing.agent
  end
end
