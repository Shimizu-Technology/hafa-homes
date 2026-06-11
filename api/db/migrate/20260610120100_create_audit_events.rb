class CreateAuditEvents < ActiveRecord::Migration[8.1]
  def change
    create_table :audit_events do |t|
      t.references :actor, foreign_key: { to_table: :users }
      t.string :actor_email
      t.string :action, null: false
      t.string :target_type
      t.bigint :target_id
      t.string :target_label
      t.references :brokerage, foreign_key: true
      t.references :lead, foreign_key: true
      t.string :ip_address
      t.string :user_agent
      t.jsonb :metadata, null: false, default: {}
      t.jsonb :changes, null: false, default: {}

      t.timestamps
    end

    add_index :audit_events, :action
    add_index :audit_events, [:target_type, :target_id]
    add_index :audit_events, :created_at
  end
end
