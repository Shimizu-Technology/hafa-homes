class CreateLeadIntentTracking < ActiveRecord::Migration[8.1]
  def up
    create_table :lead_intent_sessions do |t|
      t.string :token_digest, null: false
      t.references :user, foreign_key: true
      t.references :brokerage, foreign_key: true
      t.references :requested_agent, foreign_key: { to_table: :agents }
      t.references :converted_lead, foreign_key: { to_table: :leads, on_delete: :nullify }
      t.string :status, null: false, default: "active"
      t.string :prompt_mode, null: false, default: "balanced"
      t.string :last_prompt_key
      t.datetime :last_seen_at
      t.datetime :prompt_snoozed_until
      t.datetime :converted_at
      t.integer :events_count, null: false, default: 0
      t.jsonb :summary, null: false, default: {}
      t.timestamps
    end

    add_index :lead_intent_sessions, :token_digest, unique: true
    add_index :lead_intent_sessions, [:brokerage_id, :status, :last_seen_at], name: "index_lead_intent_sessions_on_brokerage_status_seen"
    add_index :lead_intent_sessions, [:user_id, :last_seen_at]

    create_table :lead_intent_events do |t|
      t.references :lead_intent_session, null: false, foreign_key: true
      t.references :user, foreign_key: true
      t.references :listing, foreign_key: true
      t.references :village, foreign_key: true
      t.references :agent, foreign_key: true
      t.references :brokerage, foreign_key: true
      t.string :event_name, null: false
      t.string :client_event_id
      t.string :source
      t.jsonb :metadata, null: false, default: {}
      t.datetime :occurred_at, null: false
      t.timestamps
    end

    add_index :lead_intent_events, [:lead_intent_session_id, :event_name, :occurred_at], name: "index_lead_intent_events_on_session_event_time"
    add_index :lead_intent_events, [:lead_intent_session_id, :client_event_id], unique: true, where: "client_event_id IS NOT NULL", name: "index_lead_intent_events_on_session_client_event"
    add_index :lead_intent_events, [:listing_id, :event_name, :occurred_at]
    add_index :lead_intent_events, [:village_id, :event_name, :occurred_at]

    add_reference :leads, :lead_intent_session, foreign_key: { on_delete: :nullify }
  end

  def down
    remove_reference :leads, :lead_intent_session, foreign_key: true
    drop_table :lead_intent_events
    drop_table :lead_intent_sessions
  end
end
