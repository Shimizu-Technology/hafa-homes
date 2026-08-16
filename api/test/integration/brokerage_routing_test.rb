require "test_helper"

class BrokerageRoutingTest < ActionDispatch::IntegrationTest
  setup do
    @alpha = create_brokerage(name: "Alpha Realty", slug: "alpha")
    @beta = create_brokerage(name: "Beta Realty", slug: "beta")
    BrokerageDomain.create!(brokerage: @alpha, hostname: "alpha.test")
    BrokerageDomain.create!(brokerage: @beta, hostname: "beta.test")
    @alpha_agent = Agent.create!(brokerage: @alpha, name: "Alpha Agent", email: "agent@alpha.test")
    @beta_agent = Agent.create!(brokerage: @beta, name: "Beta Agent", email: "agent@beta.test")
  end

  test "resolves context and agent directory from the public hostname" do
    get "/api/v1/context", headers: { "X-Brokerage-Host" => "www.alpha.test" }
    assert_response :success
    assert_equal @alpha.id, response.parsed_body.dig("brokerage", "id")

    get "/api/v1/agents", headers: { "X-Brokerage-Host" => "alpha.test" }
    assert_response :success
    assert_equal [ @alpha_agent.id ], response.parsed_body.fetch("agents").pluck("id")

    get "/api/v1/agents", headers: { "X-Brokerage-Slug" => @beta.slug }
    assert_response :success
    assert_equal [ @beta_agent.id ], response.parsed_body.fetch("agents").pluck("id")

    get "/api/v1/context", headers: { "X-Brokerage-Host" => "unknown.test" }
    assert_response :not_found
  end

  test "an explicit storefront host takes precedence over a native brokerage slug" do
    get "/api/v1/context", headers: {
      "X-Brokerage-Host" => "alpha.test",
      "X-Brokerage-Slug" => @beta.slug
    }

    assert_response :success
    assert_equal @alpha.id, response.parsed_body.dig("brokerage", "id")
  end

  test "resolves a native brokerage slug received as a binary encoded header" do
    binary_slug = @beta.slug.dup.force_encoding(Encoding::BINARY)

    get "/api/v1/context", headers: { "X-Brokerage-Slug" => binary_slug }

    assert_response :success
    assert_equal @beta.id, response.parsed_body.dig("brokerage", "id")
  end

  test "resolves browser requests from origin when no storefront header is present" do
    get "/api/v1/context", headers: { "Origin" => "https://beta.test" }

    assert_response :success
    assert_equal @beta.id, response.parsed_body.dig("brokerage", "id")
  end

  test "does not treat a forged referer as an authoritative storefront" do
    with_default_brokerage_slug(@alpha.slug) do
      get "/api/v1/context", headers: { "Referer" => "https://beta.test/listings" }
    end

    assert_response :success
    assert_equal @alpha.id, response.parsed_body.dig("brokerage", "id")
  end

  test "does not route explicit unknown or inactive storefronts through a fallback" do
    BrokerageDomain.find_by!(hostname: "beta.test").update!(status: "inactive")
    @beta.update!(status: "inactive")

    with_default_brokerage_slug(@alpha.slug) do
      get "/api/v1/context", headers: { "X-Brokerage-Host" => "unknown.test" }
      assert_response :not_found

      get "/api/v1/context", headers: { "X-Brokerage-Host" => "beta.test" }
      assert_response :not_found

      get "/api/v1/context", headers: { "X-Brokerage-Slug" => @beta.slug }
      assert_response :not_found
    end
  end

  test "routes public leads to the resolved broker and rejects another broker agent" do
    post "/api/v1/leads",
      headers: { "X-Brokerage-Host" => "alpha.test" },
      params: { lead: { lead_type: "showing_request", name: "Buyer", email: "buyer@example.com", requested_agent_id: @alpha_agent.id } }
    assert_response :created
    assert_equal @alpha.id, Lead.order(:id).last.brokerage_id

    post "/api/v1/leads",
      headers: { "X-Brokerage-Host" => "alpha.test" },
      params: { lead: { lead_type: "showing_request", name: "Buyer", email: "buyer@example.com", requested_agent_id: @beta_agent.id } }
    assert_response :unprocessable_entity
    assert_equal 1, Lead.count
  end

  test "scopes saved searches to the resolved brokerage" do
    post "/api/v1/saved_searches",
      headers: { "X-Brokerage-Host" => "beta.test" },
      params: { saved_search: { name: "North homes", email: "buyer@example.com", filters: { village: "yigo" }, alert_frequency: "weekly" } }

    assert_response :created
    assert_equal @beta.id, SavedSearch.order(:id).last.brokerage_id
  end

  test "scopes one consumer search profile independently per brokerage" do
    buyer = create_user(email: "buyer@example.com", clerk_id: "clerk-buyer")
    BuyerSearchProfile.create!(user: buyer, brokerage: @alpha, preferred_contact_method: "email", desired_villages: "Yigo")
    BuyerSearchProfile.create!(user: buyer, brokerage: @beta, preferred_contact_method: "phone", desired_villages: "Tamuning")
    headers = authorization_headers(buyer)

    with_clerk_auth do
      get "/api/v1/me/search_profile", headers: headers.merge("X-Brokerage-Host" => "alpha.test")
    end
    assert_response :success
    assert_equal "Yigo", response.parsed_body.dig("search_profile", "desired_villages")

    with_clerk_auth do
      patch "/api/v1/me/search_profile",
        headers: headers.merge("X-Brokerage-Host" => "beta.test"),
        params: { search_profile: { desired_villages: "Dededo" } }
    end
    assert_response :success
    assert_equal "Yigo", buyer.buyer_search_profiles.find_by!(brokerage: @alpha).desired_villages
    assert_equal "Dededo", buyer.buyer_search_profiles.find_by!(brokerage: @beta).desired_villages
  end

  test "rejects reuse of an intent session token across brokerages" do
    token = "tenant-scope-token-12345"
    params = {
      lead_intent_event: {
        session_token: token,
        event_name: "search_filter_changed",
        client_event_id: "filter-1",
        source: "web",
        metadata: { filter: "village", value: "Yigo" }
      }
    }

    post "/api/v1/lead_intent/events", headers: { "X-Brokerage-Host" => "alpha.test" }, params: params
    assert_response :created

    params[:lead_intent_event][:client_event_id] = "filter-2"
    post "/api/v1/lead_intent/events", headers: { "X-Brokerage-Host" => "beta.test" }, params: params
    assert_response :conflict
    assert_equal true, response.parsed_body["reset_session"]
    assert_equal 1, LeadIntentSession.count
    assert_equal @alpha.id, LeadIntentSession.first.brokerage_id
  end

  private

  def with_default_brokerage_slug(slug)
    previous = ENV["DEFAULT_BROKERAGE_SLUG"]
    ENV["DEFAULT_BROKERAGE_SLUG"] = slug
    yield
  ensure
    previous ? ENV["DEFAULT_BROKERAGE_SLUG"] = previous : ENV.delete("DEFAULT_BROKERAGE_SLUG")
  end
end
