class CreateShowingAppointments < ActiveRecord::Migration[8.1]
  def change
    create_table :showing_appointments do |t|
      t.references :lead, null: false, foreign_key: true
      t.references :listing, foreign_key: true
      t.references :brokerage, foreign_key: true
      t.references :agent, foreign_key: true
      t.references :created_by, foreign_key: { to_table: :users }
      t.datetime :scheduled_starts_at
      t.datetime :scheduled_ends_at
      t.string :timezone, null: false, default: "Pacific/Guam"
      t.string :tour_type, null: false, default: "in_person"
      t.string :status, null: false, default: "proposed"
      t.string :location
      t.text :consumer_notes
      t.text :internal_notes

      t.timestamps
    end

    add_index :showing_appointments, [:lead_id, :created_at]
    add_index :showing_appointments, [:brokerage_id, :scheduled_starts_at]
    add_index :showing_appointments, [:agent_id, :scheduled_starts_at]
    add_index :showing_appointments, :status
  end
end
