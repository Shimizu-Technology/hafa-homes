class BuyerSearchProfile < ApplicationRecord
  CONTACT_METHODS = User::CONTACT_METHODS
  PREQUALIFIED_STATUSES = Lead::PREQUALIFIED_STATUSES
  PURCHASE_TIMELINES = Lead::PURCHASE_TIMELINES
  BUYER_STATUSES = Lead::BUYER_STATUSES
  AGENT_RELATIONSHIP_STATUSES = Lead::AGENT_RELATIONSHIP_STATUSES

  belongs_to :user
  belongs_to :brokerage, optional: true

  validates :user_id, uniqueness: true
  validates :preferred_contact_method, inclusion: { in: CONTACT_METHODS }, allow_blank: true
  validates :prequalified_status, inclusion: { in: PREQUALIFIED_STATUSES }, allow_blank: true
  validates :purchase_timeline, inclusion: { in: PURCHASE_TIMELINES }, allow_blank: true
  validates :buyer_status, inclusion: { in: BUYER_STATUSES }, allow_blank: true
  validates :already_working_with_agent, inclusion: { in: AGENT_RELATIONSHIP_STATUSES }, allow_blank: true
  validates :budget_min, :budget_max, :desired_baths, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
  validates :desired_beds, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
  validate :budget_range_is_ordered

  before_validation :set_defaults
  before_validation :normalize_phone_number
  before_validation :normalize_text_fields
  before_save :refresh_completed_at

  def complete?
    completed_at.present?
  end

  def completion_status
    complete? ? "complete" : "incomplete"
  end

  def completion_percentage
    total = completion_checks.length
    return 0 if total.zero?

    ((completion_checks.count(true) / total.to_f) * 100).round
  end

  def completion_missing_fields
    missing = []
    missing << "preferred_contact_method" unless preferred_contact_method.present?
    missing << "purchase_timeline" unless purchase_timeline.present?
    missing << "search_criteria" unless search_criteria_present?
    missing << "readiness" unless readiness_present?
    missing
  end

  def qualification_summary
    parts = qualification_summary_parts
    return "Search profile is not filled out yet" if parts.empty?

    parts.join(" · ")
  end

  def budget_range_label
    min = budget_min&.to_f
    max = budget_max&.to_f
    return nil unless min || max
    return "#{format_money(min)}–#{format_money(max)}" if min && max
    return "#{format_money(min)}+" if min

    "up to #{format_money(max)}"
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

  def apply_to_lead(lead)
    lead.preferred_contact_method = preferred_contact_method if lead.preferred_contact_method.blank? && preferred_contact_method.present?
    lead.phone = phone if lead.phone.blank? && phone.present?
    lead.prequalified_status = prequalified_status if lead.prequalified_status.blank? && prequalified_status.present?
    lead.lender_name = lender_name if lead.lender_name.blank? && lender_name.present?
    lead.purchase_timeline = purchase_timeline if lead.purchase_timeline.blank? && purchase_timeline.present?
    lead.budget_min = budget_min if lead.budget_min.blank? && budget_min.present?
    lead.budget_max = budget_max if lead.budget_max.blank? && budget_max.present?
    lead.desired_villages = desired_villages if lead.desired_villages.blank? && desired_villages.present?
    lead.desired_beds = desired_beds if lead.desired_beds.blank? && desired_beds.present?
    lead.desired_baths = desired_baths if lead.desired_baths.blank? && desired_baths.present?
    lead.buyer_status = buyer_status if lead.buyer_status.blank? && buyer_status.present?
    lead.already_working_with_agent = already_working_with_agent if lead.already_working_with_agent.blank? && already_working_with_agent.present?
    lead.qualification_notes = notes if lead.qualification_notes.blank? && notes.present?
  end

  private

  def set_defaults
    self.preferred_contact_method = preferred_contact_method.presence
    self.brokerage ||= Brokerage.active.order(:id).first
  end

  def normalize_phone_number
    digits = phone.to_s.gsub(/\D/, "")
    if digits.blank? || %w[671 1671].include?(digits)
      self.phone = nil
      return
    end

    self.phone = ClicksendClient.normalize_phone(phone).presence || phone.to_s.strip
  end

  def normalize_text_fields
    %i[lender_name desired_villages notes].each do |field|
      self[field] = self[field].to_s.squish.presence if self[field].present?
    end
  end

  def refresh_completed_at
    if complete_enough?
      self.completed_at ||= Time.current
    else
      self.completed_at = nil
    end
  end

  def complete_enough?
    preferred_contact_method.present? && purchase_timeline.present? && search_criteria_present? && readiness_present?
  end

  def search_criteria_present?
    desired_villages.present? || budget_min.present? || budget_max.present? || desired_beds.present? || desired_baths.present?
  end

  def readiness_present?
    prequalified_status.present? || buyer_status.present? || already_working_with_agent.present?
  end

  def completion_checks
    [
      preferred_contact_method.present?,
      purchase_timeline.present?,
      search_criteria_present?,
      readiness_present?
    ]
  end

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
end
