require "test_helper"

class ClerkAuthTest < ActiveSupport::TestCase
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
