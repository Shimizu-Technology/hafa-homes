class User < ApplicationRecord
  ROLES = %w[platform_admin brokerage_admin agent consumer].freeze
  ADMIN_ROLES = %w[platform_admin brokerage_admin agent].freeze

  belongs_to :invited_by, class_name: "User", optional: true

  normalizes :email, with: ->(email) { email.to_s.strip.downcase }

  validates :clerk_id, presence: true, uniqueness: true
  validates :email, presence: true, uniqueness: { case_sensitive: false }
  validates :role, inclusion: { in: ROLES }
  validates :invitation_status, inclusion: { in: %w[pending accepted revoked failed] }

  before_validation :set_defaults

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
    ADMIN_ROLES.include?(role)
  end

  def invitation_pending?
    invitation_status == "pending" || clerk_id.to_s.start_with?("pending_")
  end

  def invitation_accepted?
    invitation_status == "accepted" && clerk_id.present? && !clerk_id.start_with?("pending_")
  end

  def full_name
    [first_name, last_name].compact_blank.join(" ").presence || email.split("@").first
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
      last_sign_in_at: last_sign_in_at,
      created_at: created_at,
      is_platform_admin: platform_admin?,
      is_brokerage_admin: brokerage_admin?,
      is_agent: agent?,
      is_consumer: consumer?,
      is_staff: staff?
    }
  end

  private

  def set_defaults
    self.role ||= "consumer"
    self.invitation_status ||= "accepted"
  end
end
