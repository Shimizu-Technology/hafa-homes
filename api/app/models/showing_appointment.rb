class ShowingAppointment < ApplicationRecord
  attr_accessor :skip_agent_inference, :activity_actor

  STATUSES = %w[proposed confirmed completed cancelled no_show].freeze
  TOUR_TYPES = %w[in_person virtual].freeze

  belongs_to :lead
  belongs_to :listing, optional: true
  belongs_to :brokerage, optional: true
  belongs_to :agent, optional: true
  belongs_to :created_by, class_name: "User", optional: true
  has_many :notification_deliveries, dependent: :destroy
  has_many :lead_activities, as: :subject, dependent: :nullify

  validates :status, inclusion: { in: STATUSES }
  validates :tour_type, inclusion: { in: TOUR_TYPES }
  validates :timezone, presence: true
  validate :ends_after_start
  validate :brokerage_matches_lead
  validate :agent_matches_brokerage
  validate :listing_matches_lead

  before_validation :set_defaults
  before_validation :infer_context_from_lead
  after_save :sync_lead_from_schedule
  after_save :persist_schedule_notifications
  after_commit :record_schedule_activity, on: [:create, :update]

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
    self.brokerage ||= lead.brokerage
    self.agent ||= lead.assigned_agent unless skip_agent_inference
    self.location ||= listing&.address if tour_type == "in_person"
  end

  def ends_after_start
    return if scheduled_starts_at.blank? || scheduled_ends_at.blank?
    return if scheduled_ends_at > scheduled_starts_at

    errors.add(:scheduled_ends_at, "must be after the start time")
  end

  def brokerage_matches_lead
    return unless lead
    return if brokerage_id == lead.brokerage_id

    errors.add(:brokerage, "must match the lead brokerage")
  end

  def agent_matches_brokerage
    return unless agent

    if brokerage_id.blank?
      errors.add(:brokerage, "must be set before assigning an agent")
      return
    end

    return if agent.brokerage_id == brokerage_id

    errors.add(:agent, "is not available for this brokerage")
  end

  def listing_matches_lead
    return unless lead&.listing && listing
    return if listing_id == lead.listing_id

    errors.add(:listing, "must match the lead listing")
  end

  def sync_lead_from_schedule
    return unless lead

    updates = {}
    updates[:assigned_agent] = agent if agent && lead.assigned_agent_id != agent_id
    if scheduled_starts_at.present? && %w[proposed confirmed].include?(status)
      updates[:status] = "showing_scheduled"
      updates[:last_contacted_at] = Time.current
    elsif %w[cancelled no_show].include?(status) && lead.status == "showing_scheduled" && no_other_active_scheduled_showings?
      updates[:status] = "contacted"
      updates[:last_contacted_at] = Time.current
    end

    lead.update!(updates) if updates.any?
  end

  def no_other_active_scheduled_showings?
    active_showings = lead.showing_appointments.where(status: %w[proposed confirmed]).where.not(scheduled_starts_at: nil)
    active_showings = active_showings.where.not(id: id) if id.present?
    !active_showings.exists?
  end

  def record_schedule_activity
    return unless crm_activity_relevant?

    LeadActivity.record!(
      lead: lead,
      action: "showing_updated",
      actor: activity_actor || created_by,
      subject: self,
      summary: previous_changes.key?("id") ? "Showing appointment created" : "Showing appointment updated",
      metadata: {
        status: status,
        tour_type: tour_type,
        scheduled_starts_at: scheduled_starts_at,
        agent_id: agent_id,
        changes: LeadActivity.change_details(previous_changes, %w[status tour_type scheduled_starts_at scheduled_ends_at location agent_id consumer_notes internal_notes])
      }
    )
  rescue StandardError => e
    Rails.logger.warn("Unable to record schedule activity for showing #{id}: #{e.class} #{e.message}")
  end

  def persist_schedule_notifications
    return unless schedule_notification_relevant?

    LeadNotificationService.queue_showing_update(self)
  end

  def crm_activity_relevant?
    return false unless lead
    return true if previous_changes.key?("id")

    %w[status scheduled_starts_at scheduled_ends_at location agent_id consumer_notes internal_notes].any? { |attribute| previous_changes.key?(attribute) }
  end

  def schedule_notification_relevant?
    return false unless lead
    return false unless scheduled_starts_at.present? || %w[cancelled no_show].include?(status)
    return true if previous_changes.key?("id")

    %w[status scheduled_starts_at scheduled_ends_at location agent_id consumer_notes].any? { |attribute| previous_changes.key?(attribute) }
  end
end
