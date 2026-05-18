class CreateListings < ActiveRecord::Migration[8.1]
  def change
    create_table :listings do |t|
      t.string :external_id
      t.string :source
      t.string :status
      t.string :listing_kind
      t.string :property_type
      t.string :title
      t.string :address
      t.references :village, null: false, foreign_key: true
      t.decimal :price
      t.integer :beds
      t.decimal :baths
      t.integer :square_feet
      t.integer :lot_square_feet
      t.integer :year_built
      t.decimal :latitude
      t.decimal :longitude
      t.text :description
      t.string :agent_name
      t.string :brokerage_name
      t.datetime :published_at
      t.datetime :source_updated_at

      t.timestamps
    end
  end
end
