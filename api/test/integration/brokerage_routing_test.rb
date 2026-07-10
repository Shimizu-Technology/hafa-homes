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
end
