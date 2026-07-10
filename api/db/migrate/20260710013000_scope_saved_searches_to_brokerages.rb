class ScopeSavedSearchesToBrokerages < ActiveRecord::Migration[8.1]
  def up
    add_reference :saved_searches, :brokerage, foreign_key: true
    execute <<~SQL.squish
      UPDATE saved_searches
      SET brokerage_id = (SELECT id FROM brokerages WHERE status = 'active' ORDER BY id LIMIT 1)
      WHERE brokerage_id IS NULL
    SQL
    change_column_null :saved_searches, :brokerage_id, false
    add_index :saved_searches, [ :brokerage_id, :created_at ]
  end

  def down
    remove_reference :saved_searches, :brokerage, foreign_key: true
  end
end
