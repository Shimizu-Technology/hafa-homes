class CreateBuyerSearchProfiles < ActiveRecord::Migration[8.1]
  def change
    create_table :buyer_search_profiles do |t|
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.references :brokerage, foreign_key: true
      t.string :preferred_contact_method
      t.string :phone
      t.string :prequalified_status
      t.string :lender_name
      t.string :purchase_timeline
      t.decimal :budget_min, precision: 12, scale: 2
      t.decimal :budget_max, precision: 12, scale: 2
      t.text :desired_villages
      t.integer :desired_beds
      t.decimal :desired_baths, precision: 4, scale: 1
      t.string :buyer_status
      t.string :already_working_with_agent
      t.text :notes
      t.datetime :completed_at
      t.datetime :last_prompted_at
      t.timestamps
    end

    add_index :buyer_search_profiles, [:brokerage_id, :completed_at]
  end
end
