class DataSyncRun < ApplicationRecord
  before_validation :set_defaults

  private

  def set_defaults
    self.status ||= "pending"
    self.imported_count ||= 0
    self.updated_count ||= 0
    self.inactive_count ||= 0
    self.error_count ||= 0
  end
end
