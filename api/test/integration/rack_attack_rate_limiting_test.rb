require "test_helper"

class RackAttackRateLimitingTest < ActionDispatch::IntegrationTest
  setup do
    @original_enabled = Rack::Attack.enabled
    @original_cache_store = Rack::Attack.cache.store
    Rack::Attack.enabled = true
    Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new
    Rack::Attack.reset!
  end

  teardown do
    Rack::Attack.reset!
    Rack::Attack.cache.store = @original_cache_store
    Rack::Attack.enabled = @original_enabled
  end

  test "throttles lead submissions per direct client IP with a structured retry response" do
    10.times do
      post "/api/v1/leads", params: {}, env: { "REMOTE_ADDR" => "203.0.113.10" }
      assert_response :bad_request
    end

    post "/api/v1/leads", params: {}, env: { "REMOTE_ADDR" => "203.0.113.10" }

    assert_response :too_many_requests
    assert_equal "application/json; charset=utf-8", response.headers["Content-Type"]
    assert_equal "no-store", response.headers["Cache-Control"]
    assert_operator response.headers.fetch("Retry-After").to_i, :>, 0
    assert_equal "rate_limited", response.parsed_body.fetch("code")
    assert_equal response.headers.fetch("Retry-After").to_i, response.parsed_body.fetch("retry_after")
  end

  test "keeps rate-limit counters isolated by direct client IP" do
    10.times do
      post "/api/v1/leads", params: {}, env: { "REMOTE_ADDR" => "203.0.113.20" }
    end

    post "/api/v1/leads", params: {}, env: { "REMOTE_ADDR" => "203.0.113.21" }

    assert_response :bad_request
  end

  test "throttles saved-search writes without affecting another public write class" do
    10.times do
      post "/api/v1/saved_searches", params: {}, env: { "REMOTE_ADDR" => "203.0.113.22" }
      refute_equal 429, response.status
    end

    post "/api/v1/saved_searches", params: {}, env: { "REMOTE_ADDR" => "203.0.113.22" }
    assert_response :too_many_requests

    post "/api/v1/leads", params: {}, env: { "REMOTE_ADDR" => "203.0.113.22" }
    assert_response :bad_request
  end

  test "throttles high-frequency intent events at their separate ceiling" do
    300.times do
      post "/api/v1/lead_intent/events", params: {}, env: { "REMOTE_ADDR" => "203.0.113.23" }
      refute_equal 429, response.status
    end

    post "/api/v1/lead_intent/events", params: {}, env: { "REMOTE_ADDR" => "203.0.113.23" }
    assert_response :too_many_requests
  end

  test "throttles notification writes by credential fingerprint and isolates credentials" do
    token_one_headers = { "Authorization" => "Bearer staff-token-one" }
    token_two_headers = { "Authorization" => "Bearer staff-token-two" }

    with_singleton_stub(ClerkAuth, :verify, nil) do
      30.times do
        post "/api/v1/leads/123/notifications", headers: token_one_headers, env: { "REMOTE_ADDR" => "203.0.113.24" }
        assert_response :unauthorized
      end

      post "/api/v1/leads/123/notifications", headers: token_one_headers, env: { "REMOTE_ADDR" => "203.0.113.24" }
      assert_response :too_many_requests

      post "/api/v1/leads/123/notifications", headers: token_two_headers, env: { "REMOTE_ADDR" => "203.0.113.24" }
      assert_response :unauthorized
    end
  end

  test "does not trust a forwarded address from a direct untrusted client" do
    request = Rack::Request.new(
      "REMOTE_ADDR" => "203.0.113.30",
      "HTTP_X_FORWARDED_FOR" => "198.51.100.99"
    )

    assert_equal "203.0.113.30", Rack::Attack.throttle_ip(request)
  end

  test "uses the resolved client address behind a trusted proxy" do
    request = Rack::Request.new(
      "REMOTE_ADDR" => "10.0.0.5",
      "action_dispatch.remote_ip" => "198.51.100.40"
    )

    assert_equal "198.51.100.40", Rack::Attack.throttle_ip(request)
  end

  test "fingerprints bearer credentials without using the raw token" do
    request = Rack::Request.new("HTTP_AUTHORIZATION" => "Bearer secret-token")

    fingerprint = Rack::Attack.bearer_fingerprint(request)
    assert_equal Digest::SHA256.hexdigest("secret-token"), fingerprint
    refute_includes fingerprint, "secret-token"
  end

  test "does not throttle health checks or read-only browsing" do
    12.times do
      get "/up", env: { "REMOTE_ADDR" => "203.0.113.50" }
      assert_response :success
    end
  end
end
