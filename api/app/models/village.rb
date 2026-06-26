class Village < ApplicationRecord
  has_many :listings, dependent: :nullify
  has_many :lead_intent_events, dependent: :nullify

  validates :name, :slug, presence: true
  validates :slug, uniqueness: true
end
