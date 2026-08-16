class ScopeBuyerSearchProfilesToBrokerages < ActiveRecord::Migration[8.1]
  def up
    missing_brokerage_count = select_value(<<~SQL.squish).to_i
      SELECT COUNT(*) FROM buyer_search_profiles WHERE brokerage_id IS NULL
    SQL
    legacy_brokerage_id = legacy_brokerage_id!(missing_brokerage_count, "buyer search profiles") if missing_brokerage_count.positive?

    if legacy_brokerage_id
      execute <<~SQL.squish
        UPDATE buyer_search_profiles
        SET brokerage_id = #{connection.quote(legacy_brokerage_id)}
        WHERE brokerage_id IS NULL
      SQL
    end

    change_column_null :buyer_search_profiles, :brokerage_id, false
    remove_index :buyer_search_profiles, :user_id, if_exists: true
    add_index :buyer_search_profiles, [ :user_id, :brokerage_id ], unique: true, name: "index_buyer_search_profiles_on_user_and_brokerage"
  end

  def down
    ensure_single_profile_per_user!
    remove_index :buyer_search_profiles, name: "index_buyer_search_profiles_on_user_and_brokerage"
    add_index :buyer_search_profiles, :user_id, unique: true
    change_column_null :buyer_search_profiles, :brokerage_id, true
  end

  private

  def ensure_single_profile_per_user!
    duplicate_user_id = select_value(<<~SQL.squish)
      SELECT user_id
      FROM buyer_search_profiles
      GROUP BY user_id
      HAVING COUNT(*) > 1
      LIMIT 1
    SQL
    return unless duplicate_user_id

    raise ActiveRecord::MigrationError,
      "Cannot reverse brokerage-scoped buyer search profiles while user #{duplicate_user_id} has profiles in multiple brokerages. " \
      "Export or consolidate those records deliberately before rolling back."
  end

  def legacy_brokerage_id!(record_count, record_label)
    explicit_slug = ENV["LEGACY_BROKERAGE_SLUG"].to_s.strip
    if explicit_slug.present?
      brokerage_id = select_value(<<~SQL.squish)
        SELECT id FROM brokerages
        WHERE slug = #{connection.quote(explicit_slug)} AND status = 'active'
      SQL
      return brokerage_id.to_i if brokerage_id

      raise ActiveRecord::MigrationError,
        "LEGACY_BROKERAGE_SLUG=#{explicit_slug.inspect} does not identify an active brokerage"
    end

    active_brokerage_ids = select_values("SELECT id FROM brokerages WHERE status = 'active' ORDER BY id")
    return active_brokerage_ids.first.to_i if active_brokerage_ids.one?

    raise ActiveRecord::MigrationError,
      "Cannot safely backfill #{record_count} legacy #{record_label} across #{active_brokerage_ids.length} active brokerages. " \
      "Set LEGACY_BROKERAGE_SLUG to the verified owner and rerun the migration."
  end
end
