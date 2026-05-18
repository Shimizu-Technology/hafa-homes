class ListingPhoto < ApplicationRecord
  belongs_to :listing

  validates :url, presence: true
end
