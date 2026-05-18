class Feature < ApplicationRecord
  has_many :listing_features, dependent: :destroy
  has_many :listings, through: :listing_features

  validates :name, :slug, presence: true
  validates :slug, uniqueness: true
end
