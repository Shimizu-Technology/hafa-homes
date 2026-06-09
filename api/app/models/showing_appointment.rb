class ShowingAppointment < ApplicationRecord
  attr_accessor :skip_agent_inference

  STATUSES = %w[proposed confirmed completed cancelled no_show].freeze
  TOUR_TYPES = %w[in_person virtual].freeze

  belongs_to :lead
  belongs_to :listing, optional: true
  belongs_to :brokerage, optional: true
  belongs_to :agent, optional: true
  belongs_to :created_by, class_name: "User", optional: true

  validates :status, inclusion: { in: STATUSES }
  validates :tour_type, inclusion: { in: TOUR_TYPES }
  validates :timezone, presence: true
  validate :ends_after_start

  before_validation :set_defaults
  before_validation :infer_context_from_lead
  after_save :sync_lead_from_schedule

  scope :upcoming, -> { where("scheduled_starts_at IS NULL OR scheduled_starts_at >= ?", Time.current).order(Arel.sql("scheduled_starts_at ASC NULLS LAST"), created_at: :desc) }

  def scheduled?
    scheduled_starts_at.present?
  end

  private

  def set_defaults
    self.status ||= "proposed"
    self.tour_type ||= lead&.tour_type.presence || "in_person"
    self.timezone ||= "Pacific/Guam"
  end

  def infer_context_from_lead
    return unless lead

    self.listing ||= lead.listing
    self.brokerage ||= lead.brokerage || listing&.brokerage
    self.agent ||= lead.assigned_agent || listing&.agent unless skip_agent_inference
    self.location ||= listing&.address if tour_type == "in_person"
  end

  def ends_after_start
    return if scheduled_starts_at.blank? || scheduled_ends_at.blank?
    return if scheduled_ends_at > scheduled_starts_at

    errors.add(:scheduled_ends_at, "must be after the start time")
  end

  def sync_lead_from_schedule
    return unless lead

    updates = {}
    updates[:assigned_agent] = agent if agent && lead.assigned_agent_id != agent_id
    updates[:brokerage] = brokerage if brokerage && lead.brokerage_id != brokerage_id
    if scheduled_starts_at.present? && %w[proposed confirmed].include?(status)
      updates[:status] = "showing_scheduled"
      updates[:last_contacted_at] = Time.current
    end

    lead.update!(updates) if updates.any?
  end
end
