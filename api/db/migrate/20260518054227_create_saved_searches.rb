class CreateSavedSearches < ActiveRecord::Migration[8.1]
  def change
    create_table :saved_searches do |t|
      t.string :name
      t.string :email
      t.jsonb :filters
      t.string :alert_frequency

      t.timestamps
    end
  end
end
