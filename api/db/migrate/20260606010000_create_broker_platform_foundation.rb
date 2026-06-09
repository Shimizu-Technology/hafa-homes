class CreateBrokerPlatformFoundation < ActiveRecord::Migration[8.1]
  def change
    create_table :brokerages do |t|
      t.string :name, null: false
      t.string :slug, null: false
      t.string :status, null: false, default: "active"
      t.string :subscription_tier
      t.string :primary_contact_name
      t.string :primary_contact_email
      t.string :phone
      t.string :website_url
      t.string :logo_url
      t.string :brand_primary_color
      t.string :brand_accent_color
      t.string :app_display_name
      t.text :compliance_disclaimer
      t.jsonb :settings, null: false, default: {}
      t.timestamps
    end
    add_index :brokerages, :slug, unique: true
    add_index :brokerages, :status

    create_table :agents do |t|
      t.references :brokerage, null: false, foreign_key: true
      t.references :user, foreign_key: true
      t.string :name, null: false
      t.string :email
      t.string :phone
      t.string :license_number
      t.string :photo_url
      t.text :bio
      t.string :status, null: false, default: "active"
      t.timestamps
    end
    add_index :agents, [:brokerage_id, :email], unique: true, where: "email IS NOT NULL"
    add_index :agents, :status

    create_table :brokerage_memberships do |t|
      t.references :brokerage, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :role, null: false, default: "agent"
      t.string :status, null: false, default: "active"
      t.timestamps
    end
    add_index :brokerage_memberships, [:brokerage_id, :user_id], unique: true, name: "index_brokerage_memberships_on_brokerage_and_user"
    add_index :brokerage_memberships, [:user_id, :role]
    add_index :brokerage_memberships, :status

    add_reference :listings, :brokerage, foreign_key: true
    add_reference :listings, :agent, foreign_key: true

    add_reference :leads, :brokerage, foreign_key: true
    add_reference :leads, :assigned_agent, foreign_key: { to_table: :agents }
    add_column :leads, :lead_source, :string, null: false, default: "hafa_homes"
    add_column :leads, :quality_status, :string, null: false, default: "unknown"
    add_column :leads, :last_contacted_at, :datetime
    add_index :leads, [:brokerage_id, :created_at]
    add_index :leads, [:assigned_agent_id, :created_at]
    add_index :leads, :quality_status
    add_index :leads, :lead_source
  end
end
