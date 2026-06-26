class Listing < ApplicationRecord
  belongs_to :village
  belongs_to :brokerage, optional: true
  belongs_to :agent, optional: true
  has_many :listing_photos, -> { order(:position) }, dependent: :destroy
  has_many :showing_appointments, dependent: :nullify
  has_many :listing_features, dependent: :destroy
  has_many :features, through: :listing_features
  has_many :leads, dependent: :nullify
  has_many :lead_intent_events, dependent: :nullify
  has_many :saved_listings, dependent: :destroy

  validates :title, :listing_kind, :property_type, :status, :price, presence: true

  scope :active, -> { where(status: "active") }
  scope :for_kind, ->(kind) { where(listing_kind: kind) if kind.present? }
  scope :in_village, ->(slug) { joins(:village).where(villages: { slug: slug }) if slug.present? }
  scope :property_type, ->(type) { where(property_type: type) if type.present? }
  scope :min_price, ->(price) { where("price >= ?", price) if price.present? }
  scope :max_price, ->(price) { where("price <= ?", price) if price.present? }
  scope :min_beds, ->(beds) { where("beds >= ?", beds) if beds.present? }
  scope :min_baths, ->(baths) { where("baths >= ?", baths) if baths.present? }

  def primary_photo_url
    listing_photos.first&.url
  end

  def feature_slugs
    features.pluck(:slug)
  end
end
