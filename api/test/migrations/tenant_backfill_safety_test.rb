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

  test "rejects an explicit inactive or unknown legacy brokerage" do
    inactive = create_brokerage(name: "Inactive Realty", slug: "inactive")
    inactive.update!(status: "inactive")

    [ inactive.slug, "missing" ].each do |slug|
      with_legacy_brokerage_slug(slug) do
        MIGRATIONS.each do |migration_class|
          error = assert_raises(ActiveRecord::MigrationError) do
            migration_class.new.send(:legacy_brokerage_id!, 1, "record")
          end
          assert_includes error.message, "does not identify an active brokerage"
        end
      end
    end
  end

  test "blocks an unsafe buyer profile rollback after multi-broker use" do
    user = create_user(email: "buyer@example.com")
    alpha = create_brokerage(name: "Alpha Realty", slug: "alpha")
    beta = create_brokerage(name: "Beta Realty", slug: "beta")
    BuyerSearchProfile.create!(user: user, brokerage: alpha)
    BuyerSearchProfile.create!(user: user, brokerage: beta)

    error = assert_raises(ActiveRecord::MigrationError) do
      ScopeBuyerSearchProfilesToBrokerages.new.send(:ensure_single_profile_per_user!)
    end

    assert_includes error.message, "Cannot reverse brokerage-scoped buyer search profiles"
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
