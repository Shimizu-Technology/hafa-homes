class RenameAuditEventChangesToFieldChanges < ActiveRecord::Migration[8.1]
  def change
    rename_column :audit_events, :changes, :field_changes
  end
end
