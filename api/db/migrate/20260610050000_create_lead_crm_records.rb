class CreateLeadCrmRecords < ActiveRecord::Migration[8.1]
  def change
    add_column :leads, :source_campaign, :string
    add_column :leads, :source_url, :string
    add_index :leads, :source_campaign

    create_table :lead_notes do |t|
      t.references :lead, null: false, foreign_key: true
      t.references :author, foreign_key: { to_table: :users }
      t.text :body, null: false
      t.string :visibility, null: false, default: "internal"

      t.timestamps
    end

    add_index :lead_notes, [:lead_id, :created_at]

    create_table :lead_tasks do |t|
      t.references :lead, null: false, foreign_key: true
      t.references :assigned_to, foreign_key: { to_table: :users }
      t.references :created_by, foreign_key: { to_table: :users }
      t.references :completed_by, foreign_key: { to_table: :users }
      t.string :title, null: false
      t.text :notes
      t.string :status, null: false, default: "open"
      t.datetime :due_at
      t.datetime :completed_at

      t.timestamps
    end

    add_index :lead_tasks, [:lead_id, :status, :due_at]
    add_index :lead_tasks, [:assigned_to_id, :status, :due_at]

    create_table :lead_activities do |t|
      t.references :lead, null: false, foreign_key: true
      t.references :actor, foreign_key: { to_table: :users }
      t.string :subject_type
      t.bigint :subject_id
      t.string :action, null: false
      t.string :summary
      t.jsonb :metadata, null: false, default: {}
      t.datetime :occurred_at, null: false

      t.timestamps
    end

    add_index :lead_activities, [:lead_id, :occurred_at]
    add_index :lead_activities, [:subject_type, :subject_id]
    add_index :lead_activities, :action
  end
end
