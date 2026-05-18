class CreateLeads < ActiveRecord::Migration[8.1]
  def change
    create_table :leads do |t|
      t.string :lead_type
      t.string :name
      t.string :email
      t.string :phone
      t.string :preferred_contact_method
      t.text :message
      t.string :status
      t.references :listing, null: true, foreign_key: true

      t.timestamps
    end
  end
end
