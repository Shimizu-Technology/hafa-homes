require "test_helper"

class AdminCustomerWorkspacesTest < ActionDispatch::IntegrationTest
  setup do
    @alpha = create_brokerage(name: "Alpha Realty", slug: "alpha")
    @beta = create_brokerage(name: "Beta Realty", slug: "beta")
    @alpha_admin = create_user(email: "admin@alpha.test", role: "brokerage_admin", clerk_id: "clerk-alpha-admin")
    @beta_admin = create_user(email: "admin@beta.test", role: "brokerage_admin", clerk_id: "clerk-beta-admin")
    BrokerageMembership.create!(brokerage: @alpha, user: @alpha_admin, role: "brokerage_admin", status: "active")
    BrokerageMembership.create!(brokerage: @beta, user: @beta_admin, role: "brokerage_admin", status: "active")

    @customer = create_user(email: "buyer@example.test", role: "consumer", clerk_id: "clerk-customer")
    @customer.update!(first_name: "Kai", last_name: "Buyer", phone: "+16715550123", preferred_contact_method: "text")
    @alpha_profile = BuyerSearchProfile.create!(user: @customer, brokerage: @alpha, desired_villages: "Yigo", purchase_timeline: "1_3_months")
    BuyerSearchProfile.create!(user: @customer, brokerage: @beta, desired_villages: "Tamuning", purchase_timeline: "6_plus_months")
    @alpha_request = Lead.create!(user: @customer, brokerage: @alpha, lead_type: "showing_request", name: "Kai Buyer", email: @customer.email)
    @beta_request = Lead.create!(user: @customer, brokerage: @beta, lead_type: "contact", name: "Kai Buyer", email: @customer.email)
    @alpha_request.showing_appointments.create!(brokerage: @alpha, status: "confirmed", scheduled_starts_at: 2.days.from_now)
    @beta_request.showing_appointments.create!(brokerage: @beta, status: "confirmed", scheduled_starts_at: 2.days.from_now)
  end

  test "brokerage admin receives only the composite brokerage customer workspace" do
    headers = authorization_headers(@alpha_admin)

    with_clerk_auth do
      get "/api/v1/admin/brokerages/#{@alpha.id}/customers/#{@customer.id}", headers: headers
    end

    assert_response :success
    payload = response.parsed_body
    assert_equal @customer.id, payload.dig("customer", "id")
    assert_equal "Kai Buyer", payload.dig("customer", "full_name")
    assert_equal @alpha.id, payload.dig("brokerage", "id")
    assert_equal @alpha_profile.id, payload.dig("search_profile", "id")
    assert_equal "Yigo", payload.dig("search_profile", "desired_villages")
    assert_equal [ @alpha_request.id ], payload.fetch("requests").pluck("id")
    assert_equal 1, payload.dig("metrics", "total_requests")
    assert_equal 1, payload.dig("metrics", "upcoming_showings")
    refute_includes payload.to_json, "Tamuning"
    refute_includes payload.fetch("requests").pluck("id"), @beta_request.id
  end

  test "brokerage admin cannot cross into another brokerage customer workspace" do
    headers = authorization_headers(@alpha_admin)

    with_clerk_auth do
      get "/api/v1/admin/brokerages/#{@beta.id}/customers/#{@customer.id}", headers: headers
    end

    assert_response :not_found
  end

  test "agent workspace contains only requests inside the agent lead scope" do
    agent_user = create_user(email: "agent@alpha.test", role: "agent", clerk_id: "clerk-alpha-agent")
    BrokerageMembership.create!(brokerage: @alpha, user: agent_user, role: "agent", status: "active")
    agent = Agent.create!(brokerage: @alpha, user: agent_user, name: "Alpha Agent", email: agent_user.email)
    @alpha_request.update!(assigned_agent: agent)
    hidden_request = Lead.create!(user: @customer, brokerage: @alpha, lead_type: "contact", name: "Kai Buyer", email: @customer.email)
    hidden_request.showing_appointments.create!(brokerage: @alpha, status: "confirmed", scheduled_starts_at: 3.days.from_now)
    headers = authorization_headers(agent_user)

    with_clerk_auth do
      get "/api/v1/admin/brokerages/#{@alpha.id}/customers/#{@customer.id}", headers: headers
    end

    assert_response :success
    payload = response.parsed_body
    assert_equal [ @alpha_request.id ], payload.fetch("requests").pluck("id")
    assert_equal 1, payload.dig("metrics", "total_requests")
    assert_equal 1, payload.dig("metrics", "upcoming_showings")
    refute_includes payload.fetch("requests").pluck("id"), hidden_request.id
  end

  test "anonymous lead is not joined to an account by matching email" do
    Lead.create!(brokerage: @alpha, lead_type: "contact", name: "Email Match", email: @customer.email)
    @alpha_request.update!(user: nil)
    headers = authorization_headers(@alpha_admin)

    with_clerk_auth do
      get "/api/v1/admin/brokerages/#{@alpha.id}/customers/#{@customer.id}", headers: headers
    end

    assert_response :not_found
  end

  test "request collection is bounded and pageable" do
    11.times do |index|
      Lead.create!(user: @customer, brokerage: @alpha, lead_type: "contact", name: "Kai Buyer #{index}", email: @customer.email)
    end
    headers = authorization_headers(@alpha_admin)

    with_clerk_auth do
      get "/api/v1/admin/brokerages/#{@alpha.id}/customers/#{@customer.id}?page=2", headers: headers
    end

    assert_response :success
    payload = response.parsed_body
    assert_equal 2, payload.fetch("requests").length
    assert_equal 12, payload.dig("pagination", "total_count")
    assert_equal 2, payload.dig("pagination", "total_pages")
  end

  test "missing brokerage profile is represented as absent rather than a global profile" do
    @alpha_profile.destroy!
    headers = authorization_headers(@alpha_admin)

    with_clerk_auth do
      get "/api/v1/admin/brokerages/#{@alpha.id}/customers/#{@customer.id}", headers: headers
    end

    assert_response :success
    assert_nil response.parsed_body.fetch("search_profile")
  end

  test "platform admin opens each brokerage relationship as a separate composite record" do
    platform_admin = create_user(email: "platform@example.test", role: "platform_admin", clerk_id: "clerk-platform")
    headers = authorization_headers(platform_admin)

    with_clerk_auth do
      get "/api/v1/admin/brokerages/#{@beta.id}/customers/#{@customer.id}", headers: headers
    end

    assert_response :success
    payload = response.parsed_body
    assert_equal @beta.id, payload.dig("brokerage", "id")
    assert_equal [ @beta_request.id ], payload.fetch("requests").pluck("id")
    assert_equal "Tamuning", payload.dig("search_profile", "desired_villages")
  end
end
