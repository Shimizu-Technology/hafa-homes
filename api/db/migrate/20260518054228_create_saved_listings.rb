class CreateSavedListings < ActiveRecord::Migration[8.1]
  def change
    create_table :saved_listings do |t|
      t.string :email
      t.references :listing, null: false, foreign_key: true

      t.timestamps
    end
  end
end
