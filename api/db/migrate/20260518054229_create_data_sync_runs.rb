class CreateDataSyncRuns < ActiveRecord::Migration[8.1]
  def change
    create_table :data_sync_runs do |t|
      t.string :provider
      t.string :status
      t.datetime :started_at
      t.datetime :finished_at
      t.integer :imported_count
      t.integer :updated_count
      t.integer :inactive_count
      t.integer :error_count
      t.text :notes

      t.timestamps
    end
  end
end
