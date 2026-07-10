class ScopeSavedSearchesToBrokerages < ActiveRecord::Migration[8.1]
  def up
    saved_search_count = select_value("SELECT COUNT(*) FROM saved_searches").to_i
    legacy_brokerage_id = legacy_brokerage_id!(saved_search_count, "saved searches") if saved_search_count.positive?

    add_reference :saved_searches, :brokerage, foreign_key: true
    if legacy_brokerage_id
      execute <<~SQL.squish
        UPDATE saved_searches
        SET brokerage_id = #{connection.quote(legacy_brokerage_id)}
        WHERE brokerage_id IS NULL
      SQL
    end
    change_column_null :saved_searches, :brokerage_id, false
    add_index :saved_searches, [ :brokerage_id, :created_at ]
  end

  def down
    remove_reference :saved_searches, :brokerage, foreign_key: true
  end

  private

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
