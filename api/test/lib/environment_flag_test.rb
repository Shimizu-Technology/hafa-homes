require "test_helper"

class EnvironmentFlagTest < ActiveSupport::TestCase
  test "parses explicit truthy and false values" do
    original = ENV["FEATURE_FLAG_TEST"]

    %w[1 true TRUE yes on].each do |value|
      ENV["FEATURE_FLAG_TEST"] = value
      assert EnvironmentFlag.enabled?("FEATURE_FLAG_TEST"), value
    end

    %w[0 false FALSE no off blank].each do |value|
      ENV["FEATURE_FLAG_TEST"] = value
      assert_not EnvironmentFlag.enabled?("FEATURE_FLAG_TEST"), value
    end
  ensure
    original ? ENV["FEATURE_FLAG_TEST"] = original : ENV.delete("FEATURE_FLAG_TEST")
  end

  test "uses the supplied default only when the variable is absent" do
    original = ENV.delete("FEATURE_FLAG_DEFAULT_TEST")

    assert EnvironmentFlag.enabled?("FEATURE_FLAG_DEFAULT_TEST", default: true)
    assert_not EnvironmentFlag.enabled?("FEATURE_FLAG_DEFAULT_TEST", default: false)
  ensure
    ENV["FEATURE_FLAG_DEFAULT_TEST"] = original if original
  end
end
