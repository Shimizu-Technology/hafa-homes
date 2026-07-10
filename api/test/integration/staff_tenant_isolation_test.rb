require "test_helper"

class StaffTenantIsolationTest < ActionDispatch::IntegrationTest
  setup do
    @alpha = create_brokerage(name: "Alpha Realty", slug: "alpha")
    @beta = create_brokerage(name: "Beta Realty", slug: "beta")
    @admin = create_user(email: "admin@alpha.test", role: "brokerage_admin", clerk_id: "clerk-alpha-admin")
    @beta_admin = create_user(email: "admin@beta.test", role: "brokerage_admin", clerk_id: "clerk-beta-admin")
    BrokerageMembership.create!(brokerage: @alpha, user: @admin, role: "brokerage_admin", status: "active")
    BrokerageMembership.create!(brokerage: @beta, user: @beta_admin, role: "brokerage_admin", status: "active")
    @alpha_lead = Lead.create!(brokerage: @alpha, lead_type: "contact", name: "Alpha Buyer", email: "alpha@example.com")
    @beta_lead = Lead.create!(brokerage: @beta, lead_type: "contact", name: "Beta Buyer", email: "beta@example.com")
  end

  test "brokerage admins only receive their brokerage leads" do
    headers = authorization_headers(@admin)
    with_clerk_auth { get "/api/v1/leads", headers: headers }

    assert_response :success
    assert_equal [ @alpha_lead.id ], response.parsed_body.fetch("leads").pluck("id")
  end

  test "tasks cannot be assigned to staff from another brokerage" do
    headers = authorization_headers(@admin)
    with_clerk_auth do
      post "/api/v1/leads/#{@alpha_lead.id}/tasks",
        headers: headers,
        params: { lead_task: { title: "Follow up", assigned_to_id: @beta_admin.id } }
    end

    assert_response :unprocessable_entity
    assert_equal 0, @alpha_lead.lead_tasks.count
  end
end
