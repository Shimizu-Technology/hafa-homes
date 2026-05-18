class CreateListingFeatures < ActiveRecord::Migration[8.1]
  def change
    create_table :listing_features do |t|
      t.references :listing, null: false, foreign_key: true
      t.references :feature, null: false, foreign_key: true

      t.timestamps
    end
  end
end
