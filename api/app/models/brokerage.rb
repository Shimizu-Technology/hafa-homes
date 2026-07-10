class Brokerage < ApplicationRecord
  STATUSES = %w[active paused inactive].freeze

  has_many :agents, dependent: :destroy
  has_many :brokerage_domains, dependent: :destroy
  has_many :brokerage_memberships, dependent: :destroy
  has_many :users, through: :brokerage_memberships
  has_many :listings, dependent: :nullify
  has_many :leads, dependent: :nullify
  has_many :lead_intent_sessions, dependent: :nullify
  has_many :lead_intent_events, dependent: :nullify
  has_many :showing_appointments, dependent: :nullify
  has_many :saved_searches, dependent: :destroy

  normalizes :slug, with: ->(slug) { slug.to_s.strip.downcase.parameterize }
  normalizes :primary_contact_email, with: ->(email) { email.to_s.strip.downcase.presence }

  validates :name, :slug, presence: true
  validates :slug, uniqueness: true
  validates :status, inclusion: { in: STATUSES }
  validates :brand_primary_color, :brand_accent_color, format: { with: /\A#[0-9a-f]{6}\z/i }, allow_blank: true

  before_validation :set_defaults

  scope :active, -> { where(status: "active") }

  def as_api_json
    {
      id: id,
      name: name,
      slug: slug,
      status: status,
      subscription_tier: subscription_tier,
      primary_contact_name: primary_contact_name,
      primary_contact_email: primary_contact_email,
      phone: phone,
      website_url: website_url,
      logo_url: logo_url,
      brand_primary_color: brand_primary_color,
      brand_accent_color: brand_accent_color,
      app_display_name: app_display_name,
      compliance_disclaimer: compliance_disclaimer
    }
  end

  def as_public_json
    {
      id: id,
      name: name,
      slug: slug,
      phone: phone,
      website_url: website_url,
      logo_url: logo_url,
      brand_primary_color: brand_primary_color,
      brand_accent_color: brand_accent_color,
      app_display_name: app_display_name,
      compliance_disclaimer: compliance_disclaimer,
      demo_data: subscription_tier == "demo"
    }
  end

  private

  def set_defaults
    self.status ||= "active"
    self.slug = name if slug.blank? && name.present?
    self.app_display_name ||= name
  end
end
