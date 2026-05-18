class CreateFeatures < ActiveRecord::Migration[8.1]
  def change
    create_table :features do |t|
      t.string :name
      t.string :slug
      t.string :category

      t.timestamps
    end
  end
end
