class SavedSearch < ApplicationRecord
  validates :email, :filters, presence: true
end
