class Lead < ApplicationRecord
  STATUSES = %w[new contacted showing_scheduled nurturing closed lost spam archived].freeze
  QUALITY_STATUSES = %w[unknown verified unverified duplicate spam].freeze
  PREQUALIFIED_STATUSES = %w[yes no in_progress not_sure].freeze
  PURCHASE_TIMELINES = %w[asap 1_3_months 3_6_months 6_plus_months just_browsing].freeze
  BUYER_STATUSES = %w[first_time upgrading relocating investor renter military selling other].freeze
  AGENT_RELATIONSHIP_STATUSES = %w[yes no not_sure].freeze

  belongs_to :listing, optional: true
  belongs_to :user, optional: true
  belongs_to :brokerage, optional: true
  belongs_to :requested_agent, class_name: "Agent", optional: true, inverse_of: :requested_leads
  belongs_to :assigned_agent, class_name: "Agent", optional: true, inverse_of: :assigned_leads
  has_many :showing_appointments, dependent: :destroy
  has_many :notification_deliveries, dependent: :destroy
  has_many :lead_notes, dependent: :destroy
  has_many :lead_tasks, dependent: :destroy
  has_many :lead_activities, dependent: :destroy

  attr_accessor :queue_request_received_notification

  after_commit :record_created_activity, on: :create
  after_commit :queue_request_received_notifications, on: :create, if: :queue_request_received_notification?

  validates :lead_type, :name, :email, presence: true
  validates :status, inclusion: { in: STATUSES }
  validates :quality_status, inclusion: { in: QUALITY_STATUSES }
  validates :prequalified_status, inclusion: { in: PREQUALIFIED_STATUSES }, allow_blank: true
  validates :purchase_timeline, inclusion: { in: PURCHASE_TIMELINES }, allow_blank: true
  validates :buyer_status, inclusion: { in: BUYER_STATUSES }, allow_blank: true
  validates :already_working_with_agent, inclusion: { in: AGENT_RELATIONSHIP_STATUSES }, allow_blank: true
  validates :budget_min, :budget_max, :desired_baths, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
  validates :desired_beds, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
  validates :quality_score, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 100 }
  validate :requested_agent_matches_routing_brokerage
  validate :budget_range_is_ordered

  before_validation :set_defaults
  before_validation :normalize_phone_number
  before_validation :normalize_qualification_fields
  before_validation :infer_routing_from_requested_agent
  before_validation :calculate_quality_score

  def qualification_details?
    qualification_summary_parts.any?
  end

  def qualification_summary
    parts = qualification_summary_parts
    return "No qualification details captured yet" if parts.empty?

    parts.join(" · ")
  end

  def qualification_temperature
    return "Hot" if quality_score.to_i >= 70
    return "Warm" if quality_score.to_i >= 45
    return "Early" if quality_score.to_i.positive?

    "Unqualified"
  end

  def prequalified_status_label
    {
      "yes" => "Yes",
      "no" => "No",
      "in_progress" => "In progress",
      "not_sure" => "Not sure"
    }[prequalified_status] || "Not provided"
  end

  def purchase_timeline_label
    {
      "asap" => "ASAP",
      "1_3_months" => "1–3 months",
      "3_6_months" => "3–6 months",
      "6_plus_months" => "6+ months",
      "just_browsing" => "Just browsing"
    }[purchase_timeline] || "Not provided"
  end

  def buyer_status_label
    {
      "first_time" => "First-time buyer",
      "upgrading" => "Upgrading",
      "relocating" => "Relocating",
      "investor" => "Investor",
      "renter" => "Renter",
      "military" => "Military move",
      "selling" => "Selling too",
      "other" => "Other"
    }[buyer_status] || "Not provided"
  end

  def already_working_with_agent_label
    {
      "yes" => "Already working with an agent",
      "no" => "Not working with an agent",
      "not_sure" => "Not sure"
    }[already_working_with_agent] || "Not provided"
  end

  def budget_range_label
    min = budget_min&.to_f
    max = budget_max&.to_f
    return nil unless min || max
    return "#{format_money(min)}–#{format_money(max)}" if min && max
    return "#{format_money(min)}+" if min

    "up to #{format_money(max)}"
  end

  private

  def qualification_summary_parts
    parts = []
    parts << "prequalified #{prequalified_status_label.downcase}" if prequalified_status.present?
    parts << "timeline #{purchase_timeline_label.downcase}" if purchase_timeline.present?
    parts << "budget #{budget_range_label}" if budget_range_label.present?
    parts << "villages #{desired_villages}" if desired_villages.present?
    parts << "#{desired_beds}+ beds" if desired_beds.present? && desired_beds.positive?
    parts << "#{format_quantity(desired_baths)}+ baths" if desired_baths.present? && desired_baths.positive?
    parts << buyer_status_label.downcase if buyer_status.present?
    parts << already_working_with_agent_label.downcase if already_working_with_agent.present?
    parts
  end

  def set_defaults
    self.status ||= "new"
    self.quality_status ||= "unknown"
    self.lead_source ||= "hafa_homes"
  end

  def normalize_phone_number
    digits = phone.to_s.gsub(/\D/, "")
    if digits.blank? || %w[671 1671].include?(digits)
      self.phone = nil
      return
    end

    self.phone = ClicksendClient.normalize_phone(phone).presence || phone.to_s.strip
  end

  def normalize_qualification_fields
    %i[lender_name desired_villages qualification_notes].each do |field|
      self[field] = self[field].to_s.squish.presence if self[field].present?
    end
  end

  def calculate_quality_score
    self.quality_score = [
      prequalification_points,
      timeline_points,
      budget_points,
      search_detail_points,
      relationship_points
    ].sum.clamp(0, 100)
  end

  def prequalification_points
    case prequalified_status
    when "yes" then 30
    when "in_progress" then 20
    when "not_sure" then 8
    else 0
    end + (lender_name.present? ? 5 : 0)
  end

  def timeline_points
    case purchase_timeline
    when "asap" then 25
    when "1_3_months" then 20
    when "3_6_months" then 12
    when "6_plus_months" then 6
    else 0
    end
  end

  def budget_points
    points = 0
    points += 10 if budget_min.present? || budget_max.present? || target_price.present?
    points += 5 if budget_min.present? && budget_max.present?
    points
  end

  def search_detail_points
    points = 0
    points += 10 if desired_villages.present?
    points += 5 if desired_beds.present? && desired_beds.positive?
    points += 5 if desired_baths.present? && desired_baths.positive?
    points += 5 if buyer_status.present?
    points
  end

  def relationship_points
    case already_working_with_agent
    when "no" then 10
    when "not_sure" then 5
    else 0
    end
  end

  def budget_range_is_ordered
    return unless budget_min.present? && budget_max.present?
    return if budget_min <= budget_max

    errors.add(:budget_max, "must be greater than or equal to budget minimum")
  end

  def format_money(value)
    "$#{value.to_i.to_fs(:delimited)}"
  end

  def format_quantity(value)
    numeric = value.to_f
    numeric == numeric.to_i ? numeric.to_i.to_s : numeric.to_s
  end

  def infer_routing_from_requested_agent
    return unless new_record? && requested_agent

    self.brokerage ||= requested_agent.brokerage
    self.assigned_agent ||= requested_agent
  end

  def requested_agent_matches_routing_brokerage
    return unless requested_agent

    if brokerage_id.blank?
      errors.add(:brokerage, "must be set before assigning a requested agent")
      return
    end

    return if requested_agent.brokerage_id == brokerage_id

    errors.add(:requested_agent, "is not available for this brokerage")
  end

  def queue_request_received_notification?
    ActiveModel::Type::Boolean.new.cast(queue_request_received_notification)
  end

  def record_created_activity
    LeadActivity.record!(
      lead: self,
      action: "lead_created",
      summary: "Lead created",
      metadata: { lead_type: lead_type, lead_source: lead_source, source_campaign: source_campaign }
    )
  end

  def queue_request_received_notifications
    LeadNotificationService.queue_request_received(self)
  end
end
