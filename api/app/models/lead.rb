class Lead < ApplicationRecord
  STATUSES = %w[new contacted showing_scheduled nurturing closed lost spam archived].freeze
  QUALITY_STATUSES = %w[unknown verified unverified duplicate spam].freeze

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
  validate :requested_agent_matches_listing_brokerage

  before_validation :set_defaults
  before_validation :normalize_phone_number
  before_validation :infer_routing_from_listing

  private

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

  def infer_routing_from_listing
    return unless new_record? && listing

    self.brokerage ||= requested_agent&.brokerage || listing.brokerage
    self.assigned_agent ||= requested_agent || listing.agent
  end

  def requested_agent_matches_listing_brokerage
    return unless requested_agent && listing&.brokerage_id
    return if requested_agent.brokerage_id == listing.brokerage_id

    errors.add(:requested_agent, "is not available for this listing")
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
