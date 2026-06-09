class CreateNotificationDeliveries < ActiveRecord::Migration[8.1]
  def change
    create_table :notification_deliveries do |t|
      t.references :lead, foreign_key: true, null: true
      t.references :showing_appointment, foreign_key: true, null: true
      t.references :sent_by, foreign_key: { to_table: :users }, null: true
      t.string :channel, null: false
      t.string :provider, null: false
      t.string :recipient_role, null: false
      t.string :recipient, null: false
      t.string :event_name, null: false
      t.string :status, null: false, default: "queued"
      t.string :provider_message_id
      t.text :error_message
      t.jsonb :metadata, null: false, default: {}
      t.datetime :queued_at
      t.datetime :sent_at
      t.datetime :failed_at
      t.timestamps
    end

    add_index :notification_deliveries, [:lead_id, :created_at]
    add_index :notification_deliveries, [:showing_appointment_id, :created_at], name: "idx_notification_deliveries_on_showing_and_created_at"
    add_index :notification_deliveries, [:channel, :status]
    add_index :notification_deliveries, :provider_message_id
  end
end
