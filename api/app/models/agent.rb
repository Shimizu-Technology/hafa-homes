class Agent < ApplicationRecord
  STATUSES = %w[active inactive].freeze

  belongs_to :brokerage
  belongs_to :user, optional: true
  has_many :listings, dependent: :nullify
  has_many :requested_leads, class_name: "Lead", foreign_key: :requested_agent_id, dependent: :nullify, inverse_of: :requested_agent
  has_many :assigned_leads, class_name: "Lead", foreign_key: :assigned_agent_id, dependent: :nullify, inverse_of: :assigned_agent
  has_many :showing_appointments, dependent: :nullify

  normalizes :email, with: ->(email) { email.to_s.strip.downcase.presence }

  validates :name, presence: true
  validates :email, uniqueness: { scope: :brokerage_id, case_sensitive: false }, allow_nil: true
  validates :status, inclusion: { in: STATUSES }

  before_validation :set_defaults

  scope :active, -> { where(status: "active") }

  def as_api_json
    {
      id: id,
      brokerage_id: brokerage_id,
      name: name,
      email: email,
      phone: phone,
      license_number: license_number,
      photo_url: photo_url,
      bio: bio,
      status: status,
      brokerage: brokerage&.as_api_json
    }
  end

  private

  def set_defaults
    self.status ||= "active"
  end
end
