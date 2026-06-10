class AddArchiveTrackingToLeadCrmRecords < ActiveRecord::Migration[8.1]
  def change
    add_reference :lead_notes, :archived_by, foreign_key: { to_table: :users }
    add_column :lead_notes, :archived_at, :datetime
    add_index :lead_notes, [:lead_id, :archived_at, :created_at]

    add_reference :lead_tasks, :archived_by, foreign_key: { to_table: :users }
    add_column :lead_tasks, :archived_at, :datetime
    add_index :lead_tasks, [:lead_id, :archived_at, :status, :due_at], name: "index_lead_tasks_on_lead_archive_status_due"
  end
end
