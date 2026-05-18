class CreateVillages < ActiveRecord::Migration[8.1]
  def change
    create_table :villages do |t|
      t.string :name
      t.string :slug
      t.string :region
      t.text :description
      t.decimal :latitude
      t.decimal :longitude

      t.timestamps
    end
  end
end
