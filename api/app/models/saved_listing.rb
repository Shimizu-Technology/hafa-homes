class SavedListing < ApplicationRecord
  belongs_to :listing
  belongs_to :user, optional: true

  validates :email, presence: true, unless: :user_id?
  validates :listing_id, uniqueness: { scope: :user_id }, if: :user_id?
  validates :listing_id, uniqueness: { scope: :email }, if: -> { user_id.blank? && email.present? }
end
