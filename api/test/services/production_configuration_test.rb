require "test_helper"

class ProductionConfigurationTest < ActiveSupport::TestCase
  def valid_environment
    {
      "CLERK_ISSUER" => "https://example.clerk.accounts.dev",
      "CLERK_SECRET_KEY" => "sk_live_example",
      "WEB_ORIGIN" => "https://hafahomes.com",
      "EMAIL_NOTIFICATIONS_ENABLED" => "false",
      "LIVE_SMS_ENABLED" => "false"
    }
  end

  test "accepts live Clerk configuration with disabled notification providers" do
    assert ProductionConfiguration.validate!(valid_environment)
  end

  test "rejects test or local Clerk configuration without exposing values" do
    error = assert_raises(ProductionConfiguration::ConfigurationError) do
      ProductionConfiguration.validate!(valid_environment.merge(
        "CLERK_ISSUER" => "http://localhost:3000",
        "CLERK_SECRET_KEY" => "sk_test_private-value"
      ))
    end

    assert_includes error.message, "CLERK_ISSUER"
    assert_includes error.message, "CLERK_SECRET_KEY"
    refute_includes error.message, "private-value"
  end

  test "rejects an empty live Clerk key prefix" do
    error = assert_raises(ProductionConfiguration::ConfigurationError) do
      ProductionConfiguration.validate!(valid_environment.merge("CLERK_SECRET_KEY" => "sk_live_"))
    end

    assert_includes error.message, "CLERK_SECRET_KEY"
  end

  test "rejects issuer credentials, paths, queries, and fragments" do
    [
      "https://user:pass@example.clerk.accounts.dev",
      "https://example.clerk.accounts.dev/path",
      "https://example.clerk.accounts.dev?tenant=test",
      "https://example.clerk.accounts.dev#issuer",
      "https://[::ffff:127.0.0.1]",
      "https://localhost.",
      "https://100.64.0.1",
      "https://169.254.169.254",
      "https://[::]"
    ].each do |issuer|
      assert_raises(ProductionConfiguration::ConfigurationError) do
        ProductionConfiguration.validate!(valid_environment.merge("CLERK_ISSUER" => issuer))
      end
    end
  end

  test "requires public web and notification origins" do
    [
      {},
      { "WEB_ORIGIN" => "http://localhost:5173" },
      { "WEB_ORIGINS" => "https://hafahomes.com,http://localhost:5173" },
      { "FRONTEND_URL" => "https://hafahomes.com/path" }
    ].each do |overrides|
      environment = valid_environment.merge(overrides)
      environment.delete("WEB_ORIGIN") if overrides.empty? || overrides.key?("WEB_ORIGINS")

      assert_raises(ProductionConfiguration::ConfigurationError) do
        ProductionConfiguration.validate!(environment)
      end
    end

    assert ProductionConfiguration.validate!(valid_environment.merge(
      "WEB_ORIGINS" => "https://hafahomes.com, https://broker.example",
      "FRONTEND_URL" => "https://hafahomes.com/"
    ))
  end

  test "rejects a stale JWKS override and accepts the issuer-derived URL" do
    assert_raises(ProductionConfiguration::ConfigurationError) do
      ProductionConfiguration.validate!(valid_environment.merge("CLERK_JWKS_URL" => "https://test.clerk.accounts.dev/.well-known/jwks.json"))
    end

    matching = "https://example.clerk.accounts.dev/.well-known/jwks.json"
    assert ProductionConfiguration.validate!(valid_environment.merge("CLERK_JWKS_URL" => matching))
  end

  test "requires provider credentials only when live delivery is enabled" do
    assert_raises(ProductionConfiguration::ConfigurationError) do
      ProductionConfiguration.validate!(valid_environment.merge("EMAIL_NOTIFICATIONS_ENABLED" => "true"))
    end
    assert_raises(ProductionConfiguration::ConfigurationError) do
      ProductionConfiguration.validate!(valid_environment.merge("LIVE_SMS_ENABLED" => "true"))
    end

    configured = valid_environment.merge(
      "EMAIL_NOTIFICATIONS_ENABLED" => "true",
      "RESEND_API_KEY" => "re_example",
      "RESEND_FROM_EMAIL" => "Hafa Homes <hello@example.com>",
      "LIVE_SMS_ENABLED" => "true",
      "CLICKSEND_USERNAME" => "example",
      "CLICKSEND_API_KEY" => "example"
    )
    assert ProductionConfiguration.validate!(configured)
  end
end
