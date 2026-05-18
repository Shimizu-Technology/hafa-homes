class SavedListing < ApplicationRecord
  belongs_to :listing

  validates :email, presence: true
  validates :listing_id, uniqueness: { scope: :email }
end
