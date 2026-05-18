class Village < ApplicationRecord
  has_many :listings, dependent: :nullify

  validates :name, :slug, presence: true
  validates :slug, uniqueness: true
end
