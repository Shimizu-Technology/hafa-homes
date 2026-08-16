class BrokerageDomain < ApplicationRecord
  STATUSES = %w[active pending inactive].freeze

  belongs_to :brokerage

  normalizes :hostname, with: ->(hostname) { BrokerageDomain.normalize_hostname(hostname) }

  validates :hostname, presence: true, uniqueness: { case_sensitive: false }
  validates :status, inclusion: { in: STATUSES }
  validates :brokerage_id, uniqueness: { conditions: -> { where(primary: true) } }, if: :primary?
  validate :hostname_is_valid

  scope :active, -> { where(status: "active") }

  def as_api_json
    {
      id: id,
      brokerage_id: brokerage_id,
      hostname: hostname,
      status: status,
      primary: primary,
      brokerage: brokerage&.as_public_json
    }
  end

  def self.normalize_hostname(value)
    value.to_s.strip.downcase.sub(/\Ahttps?:\/\//, "").split("/").first.to_s.split(":").first.to_s.sub(/\Awww\./, "").presence
  end

  private

  def hostname_is_valid
    return if hostname.blank?
    return if hostname == "localhost"
    return if hostname.match?(/\A(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\z/)

    errors.add(:hostname, "must be a valid hostname")
  end
end
