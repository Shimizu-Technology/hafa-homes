class SavedSearch < ApplicationRecord
  belongs_to :brokerage

  validates :email, :filters, presence: true
end
