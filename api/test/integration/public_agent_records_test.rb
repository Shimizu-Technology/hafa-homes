require "test_helper"

class PublicAgentRecordsTest < ActionDispatch::IntegrationTest
  setup do
    @alpha = create_brokerage(name: "Alpha Realty", slug: "alpha")
    @beta = create_brokerage(name: "Beta Realty", slug: "beta")
    BrokerageDomain.create!(brokerage: @alpha, hostname: "alpha.example.test", status: "active", primary: true)
    BrokerageDomain.create!(brokerage: @beta, hostname: "beta.example.test", status: "active", primary: true)
    @alpha_agent = Agent.create!(brokerage: @alpha, name: "Ana Alpha", email: "ana@alpha.test", bio: "North-island relocation specialist")
    @beta_agent = Agent.create!(brokerage: @beta, name: "Ben Beta", email: "ben@beta.test")
    @inactive_agent = Agent.create!(brokerage: @alpha, name: "Inactive Agent", status: "inactive")
    village = Village.create!(name: "Yigo", slug: "yigo", region: "north")
    @alpha_listing = Listing.create!(
      village: village,
      brokerage: @alpha,
      agent: @alpha_agent,
      title: "Ana attributed home",
      listing_kind: "sale",
      property_type: "house",
      status: "active",
      price: 650_000
    )
    Listing.create!(
      village: village,
      brokerage: @alpha,
      agent: @alpha_agent,
      title: "Withdrawn attributed home",
      listing_kind: "sale",
      property_type: "house",
      status: "inactive",
      price: 625_000
    )
    @beta_listing = Listing.create!(
      village: village,
      brokerage: @beta,
      agent: @beta_agent,
      title: "Ben attributed home",
      listing_kind: "sale",
      property_type: "house",
      status: "active",
      price: 700_000
    )
  end

  test "show returns an active agent and bounded active attribution for the current storefront" do
    get "/api/v1/agents/#{@alpha_agent.id}", headers: { "X-Brokerage-Host" => "alpha.example.test" }

    assert_response :success
    payload = response.parsed_body
    assert_equal @alpha_agent.id, payload.dig("agent", "id")
    assert_equal @alpha.id, payload.dig("agent", "brokerage_id")
    assert_equal [ @alpha_listing.id ], payload.fetch("attributed_listings").pluck("id")
    assert_equal 1, payload.dig("pagination", "total_count")
    refute_includes payload.to_json, @beta_listing.title
    refute_includes payload.to_json, "Withdrawn attributed home"
  end

  test "show fails closed for another storefront agent" do
    get "/api/v1/agents/#{@beta_agent.id}", headers: { "X-Brokerage-Host" => "alpha.example.test" }

    assert_response :not_found
  end

  test "show fails closed for an inactive storefront agent" do
    get "/api/v1/agents/#{@inactive_agent.id}", headers: { "X-Brokerage-Host" => "alpha.example.test" }

    assert_response :not_found
  end

  test "show fails closed when an explicit storefront host is unknown" do
    get "/api/v1/agents/#{@alpha_agent.id}", headers: { "X-Brokerage-Host" => "unknown.example.test" }

    assert_response :not_found
  end
end
