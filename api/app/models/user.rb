class User < ApplicationRecord
  ROLES = %w[platform_admin brokerage_admin agent consumer].freeze
  ADMIN_ROLES = %w[platform_admin brokerage_admin agent].freeze
  CONTACT_METHODS = %w[phone text email].freeze

  belongs_to :invited_by, class_name: "User", optional: true
  belongs_to :archived_by, class_name: "User", optional: true
  has_many :invited_users, class_name: "User", foreign_key: :invited_by_id, dependent: :nullify, inverse_of: :invited_by
  has_many :archived_users, class_name: "User", foreign_key: :archived_by_id, dependent: :nullify, inverse_of: :archived_by
  has_many :saved_listing_records, class_name: "SavedListing", dependent: :destroy
  has_many :saved_listings, through: :saved_listing_records, source: :listing
  has_many :buyer_search_profiles, dependent: :destroy
  has_many :leads, dependent: :nullify
  has_many :lead_intent_sessions, dependent: :nullify
  has_many :lead_intent_events, dependent: :nullify
  has_many :brokerage_memberships, dependent: :destroy
  has_many :brokerages, through: :brokerage_memberships
  has_many :agent_profiles, class_name: "Agent", dependent: :nullify
  has_many :created_showing_appointments, class_name: "ShowingAppointment", foreign_key: :created_by_id, dependent: :nullify, inverse_of: :created_by
  has_many :lead_activities_as_actor, class_name: "LeadActivity", foreign_key: :actor_id, dependent: :nullify, inverse_of: :actor
  has_many :authored_lead_notes, class_name: "LeadNote", foreign_key: :author_id, dependent: :nullify, inverse_of: :author
  has_many :archived_lead_notes, class_name: "LeadNote", foreign_key: :archived_by_id, dependent: :nullify, inverse_of: :archived_by
  has_many :assigned_lead_tasks, class_name: "LeadTask", foreign_key: :assigned_to_id, dependent: :nullify, inverse_of: :assigned_to
  has_many :created_lead_tasks, class_name: "LeadTask", foreign_key: :created_by_id, dependent: :nullify, inverse_of: :created_by
  has_many :completed_lead_tasks, class_name: "LeadTask", foreign_key: :completed_by_id, dependent: :nullify, inverse_of: :completed_by
  has_many :archived_lead_tasks, class_name: "LeadTask", foreign_key: :archived_by_id, dependent: :nullify, inverse_of: :archived_by
  has_many :sent_notification_deliveries, class_name: "NotificationDelivery", foreign_key: :sent_by_id, dependent: :nullify, inverse_of: :sent_by
  has_many :audit_events_as_actor, class_name: "AuditEvent", foreign_key: :actor_id, dependent: :nullify, inverse_of: :actor

  normalizes :email, with: ->(email) { email.to_s.strip.downcase }

  validates :clerk_id, presence: true, uniqueness: true
  validates :email, presence: true, uniqueness: { case_sensitive: false }
  validates :role, inclusion: { in: ROLES }
  validates :preferred_contact_method, inclusion: { in: CONTACT_METHODS }, allow_blank: true
  validates :invitation_status, inclusion: { in: %w[pending accepted revoked failed] }
  validate :phone_number_format, if: :will_save_change_to_phone?

  before_validation :set_defaults
  before_validation :normalize_phone_number

  def platform_admin?
    role == "platform_admin"
  end

  def brokerage_admin?
    role == "brokerage_admin"
  end

  def agent?
    role == "agent"
  end

  def consumer?
    role == "consumer"
  end

  def admin?
    platform_admin? || brokerage_admin?
  end

  def staff?
    ADMIN_ROLES.include?(role) && !archived?
  end

  def archived?
    archived_at.present?
  end

  def active?
    !archived?
  end

  def archive!(actor: nil)
    update!(archived_at: Time.current, archived_by: actor, invitation_status: invitation_status == "pending" ? "revoked" : invitation_status)
  end

  def reactivate!
    update!(archived_at: nil, archived_by: nil, invitation_status: invitation_status == "revoked" ? "pending" : invitation_status)
  end

  def invitation_pending?
    invitation_status == "pending" || clerk_id.to_s.start_with?("pending_")
  end

  def invitation_accepted?
    invitation_status == "accepted" && clerk_id.present? && !clerk_id.start_with?("pending_")
  end

  def full_name
    [ first_name, last_name ].compact_blank.join(" ").presence || email.split("@").first
  end

  def active_brokerage_ids
    brokerage_memberships.active.pluck(:brokerage_id)
  end

  def active_brokerage_admin_ids
    brokerage_memberships.active.where(role: "brokerage_admin").pluck(:brokerage_id)
  end

  def active_agent_member_brokerage_ids
    brokerage_memberships.active.where(role: "agent").pluck(:brokerage_id)
  end

  def active_agent_ids
    agent_profiles.active.pluck(:id)
  end

  def as_api_json
    {
      id: id,
      clerk_id: clerk_id,
      email: email,
      first_name: first_name,
      last_name: last_name,
      full_name: full_name,
      role: role,
      invitation_status: invitation_status,
      phone: phone,
      preferred_contact_method: preferred_contact_method,
      archived_at: archived_at,
      archived_by: archived_by_json,
      last_sign_in_at: last_sign_in_at,
      created_at: created_at,
      is_platform_admin: platform_admin?,
      is_brokerage_admin: brokerage_admin?,
      is_agent: agent?,
      is_consumer: consumer?,
      is_staff: staff?,
      brokerages: brokerage_memberships_for_api.map(&:as_api_json)
    }
  end

  private

  def brokerage_memberships_for_api
    if brokerage_memberships.loaded?
      brokerage_memberships.select(&:active?)
    else
      brokerage_memberships.active.includes(:brokerage).to_a
    end
  end

  def archived_by_json
    return nil unless archived_by

    {
      id: archived_by.id,
      full_name: archived_by.full_name,
      email: archived_by.email,
      role: archived_by.role
    }
  end

  def set_defaults
    self.role ||= "consumer"
    self.invitation_status ||= "accepted"
    self.preferred_contact_method = preferred_contact_method.presence
  end

  def normalize_phone_number
    return if phone.blank?

    normalized_phone = ClicksendClient.normalize_phone(phone)
    self.phone = normalized_phone if normalized_phone.present?
  end

  def phone_number_format
    return if phone.blank?
    return if ClicksendClient.normalize_phone(phone).present?

    errors.add(:phone, "must be a valid Guam or US phone number")
  end
end
