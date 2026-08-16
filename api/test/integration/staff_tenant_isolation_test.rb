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

  test "brokerage admins cannot read or update another brokerage lead or task" do
    beta_task = @beta_lead.lead_tasks.create!(title: "Beta follow up", created_by: @beta_admin)
    headers = authorization_headers(@admin)

    with_clerk_auth { get "/api/v1/leads/#{@beta_lead.id}", headers: headers }
    assert_response :not_found

    with_clerk_auth do
      patch "/api/v1/lead_tasks/#{beta_task.id}",
        headers: headers,
        params: { lead_task: { title: "Tampered" } }
    end
    assert_response :not_found
    assert_equal "Beta follow up", beta_task.reload.title
  end

  test "brokerage admins only receive and mutate showings for their brokerage" do
    alpha_showing = @alpha_lead.showing_appointments.create!(created_by: @admin)
    beta_showing = @beta_lead.showing_appointments.create!(created_by: @beta_admin)
    headers = authorization_headers(@admin)

    with_clerk_auth { get "/api/v1/showing_appointments", headers: headers }
    assert_response :success
    assert_equal [ alpha_showing.id ], response.parsed_body.fetch("showing_appointments").pluck("id")

    with_clerk_auth do
      patch "/api/v1/showing_appointments/#{beta_showing.id}",
        headers: headers,
        params: { showing_appointment: { status: "confirmed" } }
    end
    assert_response :not_found
    assert_equal "proposed", beta_showing.reload.status
  end

  test "platform admins retain explicit cross-brokerage visibility" do
    platform_admin = create_user(email: "platform@example.com", role: "platform_admin", clerk_id: "clerk-platform")
    headers = authorization_headers(platform_admin)

    with_clerk_auth { get "/api/v1/leads", headers: headers }

    assert_response :success
    assert_equal [ @alpha_lead.id, @beta_lead.id ].sort, response.parsed_body.fetch("leads").pluck("id").sort
  end
end
