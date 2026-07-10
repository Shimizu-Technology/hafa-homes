class ScopeBuyerSearchProfilesToBrokerages < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL.squish
      UPDATE buyer_search_profiles
      SET brokerage_id = (SELECT id FROM brokerages WHERE status = 'active' ORDER BY id LIMIT 1)
      WHERE brokerage_id IS NULL
    SQL

    change_column_null :buyer_search_profiles, :brokerage_id, false
    remove_index :buyer_search_profiles, :user_id, if_exists: true
    add_index :buyer_search_profiles, [ :user_id, :brokerage_id ], unique: true, name: "index_buyer_search_profiles_on_user_and_brokerage"
  end

  def down
    remove_index :buyer_search_profiles, name: "index_buyer_search_profiles_on_user_and_brokerage"
    add_index :buyer_search_profiles, :user_id, unique: true
    change_column_null :buyer_search_profiles, :brokerage_id, true
  end
end
