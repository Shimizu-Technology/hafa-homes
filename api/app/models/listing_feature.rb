class ListingFeature < ApplicationRecord
  belongs_to :listing
  belongs_to :feature

  validates :feature_id, uniqueness: { scope: :listing_id }
end
