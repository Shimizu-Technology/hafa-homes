class Lead < ApplicationRecord
  belongs_to :listing, optional: true
  belongs_to :user, optional: true

  validates :lead_type, :name, :email, presence: true

  before_validation :set_default_status

  private

  def set_default_status
    self.status ||= "new"
  end
end
