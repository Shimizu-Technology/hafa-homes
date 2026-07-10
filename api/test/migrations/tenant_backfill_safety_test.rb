require "test_helper"
require Rails.root.join("db/migrate/20260710011000_scope_buyer_search_profiles_to_brokerages")
require Rails.root.join("db/migrate/20260710013000_scope_saved_searches_to_brokerages")

class TenantBackfillSafetyTest < ActiveSupport::TestCase
  MIGRATIONS = [
    ScopeBuyerSearchProfilesToBrokerages,
    ScopeSavedSearchesToBrokerages
  ].freeze

  test "rejects an implicit backfill when multiple brokerages are active" do
    create_brokerage(name: "Alpha Realty", slug: "alpha")
    create_brokerage(name: "Beta Realty", slug: "beta")

    with_legacy_brokerage_slug(nil) do
      MIGRATIONS.each do |migration_class|
        error = assert_raises(ActiveRecord::MigrationError) do
          migration_class.new.send(:legacy_brokerage_id!, 3, "records")
        end
        assert_includes error.message, "Cannot safely backfill 3 legacy records"
      end
    end
  end

  test "accepts a verified explicit legacy brokerage" do
    alpha = create_brokerage(name: "Alpha Realty", slug: "alpha")
    create_brokerage(name: "Beta Realty", slug: "beta")

    with_legacy_brokerage_slug(alpha.slug) do
      MIGRATIONS.each do |migration_class|
        assert_equal alpha.id, migration_class.new.send(:legacy_brokerage_id!, 3, "records")
      end
    end
  end

  test "accepts the only active brokerage without extra configuration" do
    Brokerage.update_all(status: "inactive")
    alpha = create_brokerage(name: "Alpha Realty", slug: "alpha")

    with_legacy_brokerage_slug(nil) do
      MIGRATIONS.each do |migration_class|
        assert_equal alpha.id, migration_class.new.send(:legacy_brokerage_id!, 3, "records")
      end
    end
  end

  private

  def with_legacy_brokerage_slug(slug)
    previous = ENV["LEGACY_BROKERAGE_SLUG"]
    slug ? ENV["LEGACY_BROKERAGE_SLUG"] = slug : ENV.delete("LEGACY_BROKERAGE_SLUG")
    yield
  ensure
    previous ? ENV["LEGACY_BROKERAGE_SLUG"] = previous : ENV.delete("LEGACY_BROKERAGE_SLUG")
  end
end
