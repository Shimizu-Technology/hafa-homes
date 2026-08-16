ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module TestData
  def create_brokerage(name:, slug:)
    Brokerage.create!(
      name: name,
      slug: slug,
      status: "active",
      subscription_tier: "pilot",
      app_display_name: name,
      brand_primary_color: "#0f3d35",
      brand_accent_color: "#17a9df"
    )
  end

  def create_user(email:, role: "consumer", clerk_id: nil)
    User.create!(
      clerk_id: clerk_id || "clerk_#{SecureRandom.hex(8)}",
      email: email,
      role: role,
      invitation_status: "accepted",
      accepted_at: Time.current
    )
  end

  def authorization_headers(user, extra = {})
    { "Authorization" => "Bearer test-token" }.merge(extra).tap do
      @clerk_claims = { "sub" => user.clerk_id, "email" => user.email }
    end
  end

  def with_clerk_auth
    with_singleton_stub(ClerkAuth, :verify, @clerk_claims) { yield }
  end

  def with_singleton_stub(target, method_name, value)
    original = target.method(method_name)
    target.define_singleton_method(method_name) { |*| value }
    yield
  ensure
    target.define_singleton_method(method_name, original)
  end
end

class ActiveSupport::TestCase
  include TestData
  parallelize(workers: 1)
end

class ActionDispatch::IntegrationTest
  include TestData
end
