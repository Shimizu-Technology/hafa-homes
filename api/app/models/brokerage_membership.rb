class BrokerageMembership < ApplicationRecord
  ROLES = %w[brokerage_admin agent].freeze
  STATUSES = %w[active inactive invited revoked].freeze

  belongs_to :brokerage
  belongs_to :user

  validates :role, inclusion: { in: ROLES }
  validates :status, inclusion: { in: STATUSES }
  validates :user_id, uniqueness: { scope: :brokerage_id }

  before_validation :set_defaults

  scope :active, -> { where(status: "active") }

  def as_api_json
    {
      id: id,
      brokerage_id: brokerage_id,
      user_id: user_id,
      role: role,
      status: status,
      brokerage: brokerage&.as_api_json
    }
  end

  private

  def set_defaults
    self.role ||= "agent"
    self.status ||= "active"
  end
end
