require "test_helper"

class ClerkAuthTest < ActiveSupport::TestCase
  test "JWKS fetch exception logs contain only the exception class" do
    original_get = HTTParty.method(:get)
    original_logger = Rails.logger
    original_issuer = ENV["CLERK_ISSUER"]
    original_jwks_url = ENV["CLERK_JWKS_URL"]
    messages = []
    logger = Object.new
    logger.define_singleton_method(:error) { |message| messages << message }
    HTTParty.define_singleton_method(:get) { |*| raise Timeout::Error, "buyer@example.com provider_private_detail" }
    Rails.logger = logger
    ENV["CLERK_ISSUER"] = "https://example.clerk.accounts.dev"
    ENV.delete("CLERK_JWKS_URL")

    assert_nil ClerkAuth.send(:fetch_jwks, force_refresh: true)
    assert_equal [ "Error fetching Clerk JWKS: Timeout::Error" ], messages
    refute_includes messages.join, "buyer@example.com"
    refute_includes messages.join, "provider_private_detail"
  ensure
    HTTParty.define_singleton_method(:get, original_get) if original_get
    Rails.logger = original_logger if original_logger
    original_issuer ? ENV["CLERK_ISSUER"] = original_issuer : ENV.delete("CLERK_ISSUER")
    original_jwks_url ? ENV["CLERK_JWKS_URL"] = original_jwks_url : ENV.delete("CLERK_JWKS_URL")
  end

  test "profile fetch exception logs contain only the exception class" do
    original_get = HTTParty.method(:get)
    original_logger = Rails.logger
    original_secret = ENV["CLERK_SECRET_KEY"]
    messages = []
    logger = Object.new
    logger.define_singleton_method(:warn) { |message| messages << message }
    HTTParty.define_singleton_method(:get) { |*| raise Timeout::Error, "buyer@example.com user_private_identifier" }
    Rails.logger = logger
    ENV["CLERK_SECRET_KEY"] = "sk_live_example"

    assert_nil ClerkAuth.fetch_user_profile("user_private_identifier")
    assert_equal [ "Clerk API profile fetch failed: Timeout::Error" ], messages
    refute_includes messages.join, "buyer@example.com"
    refute_includes messages.join, "user_private_identifier"
  ensure
    HTTParty.define_singleton_method(:get, original_get) if original_get
    Rails.logger = original_logger if original_logger
    original_secret ? ENV["CLERK_SECRET_KEY"] = original_secret : ENV.delete("CLERK_SECRET_KEY")
  end

  test "deletion exception logs contain only the exception class" do
    original_delete = HTTParty.method(:delete)
    original_logger = Rails.logger
    original_secret = ENV["CLERK_SECRET_KEY"]
    messages = []
    logger = Object.new
    logger.define_singleton_method(:warn) { |message| messages << message }
    HTTParty.define_singleton_method(:delete) { |*| raise Timeout::Error, "buyer@example.com user_private_identifier" }
    Rails.logger = logger
    ENV["CLERK_SECRET_KEY"] = "sk_live_example"

    result = ClerkAuth.delete_user("user_private_identifier")

    assert_equal({ success: false, status: :network_error, message: "Unable to reach Clerk" }, result)
    assert_equal [ "Clerk API account deletion failed: Timeout::Error" ], messages
    refute_includes messages.join, "buyer@example.com"
    refute_includes messages.join, "user_private_identifier"
  ensure
    HTTParty.define_singleton_method(:delete, original_delete) if original_delete
    Rails.logger = original_logger if original_logger
    original_secret ? ENV["CLERK_SECRET_KEY"] = original_secret : ENV.delete("CLERK_SECRET_KEY")
  end

  test "does not log provider response data or Clerk identifiers when deletion fails" do
    response = Struct.new(:code, :body) do
      def success?
        false
      end
    end.new(422, '{"email":"buyer@example.com","detail":"provider private detail"}')
    original_delete = HTTParty.method(:delete)
    original_logger = Rails.logger
    original_secret = ENV["CLERK_SECRET_KEY"]
    messages = []
    logger = Object.new
    logger.define_singleton_method(:warn) { |message| messages << message }
    HTTParty.define_singleton_method(:delete) { |*| response }
    Rails.logger = logger
    ENV["CLERK_SECRET_KEY"] = "sk_live_example"

    result = ClerkAuth.delete_user("user_private_identifier")

    assert_equal({ success: false, status: 422, message: "Unable to delete Clerk account" }, result)
    assert_equal [ "Clerk API account deletion failed: HTTP 422" ], messages
    refute_includes messages.join, "buyer@example.com"
    refute_includes messages.join, "private detail"
    refute_includes messages.join, "user_private_identifier"
  ensure
    HTTParty.define_singleton_method(:delete, original_delete) if original_delete
    Rails.logger = original_logger if original_logger
    original_secret ? ENV["CLERK_SECRET_KEY"] = original_secret : ENV.delete("CLERK_SECRET_KEY")
  end
end
