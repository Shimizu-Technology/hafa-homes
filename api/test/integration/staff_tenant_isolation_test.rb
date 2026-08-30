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

  test "brokerage admins can open an exact showing only inside their staff scope" do
    alpha_showing = @alpha_lead.showing_appointments.create!(created_by: @admin, internal_notes: "Use the side entrance")
    beta_showing = @beta_lead.showing_appointments.create!(created_by: @beta_admin)
    headers = authorization_headers(@admin)

    with_clerk_auth { get "/api/v1/showing_appointments/#{alpha_showing.id}", headers: headers }
    assert_response :success
    showing = response.parsed_body.fetch("showing_appointment")
    assert_equal alpha_showing.id, showing.fetch("id")
    assert_equal @alpha_lead.id, showing.dig("lead", "id")
    assert_equal "Alpha Buyer", showing.dig("lead", "name")
    assert_equal "Use the side entrance", showing.fetch("internal_notes")

    with_clerk_auth { get "/api/v1/showing_appointments/#{beta_showing.id}", headers: headers }
    assert_response :not_found
  end

  test "consumer showing projection excludes staff-only notes and the nested lead" do
    showing = @alpha_lead.showing_appointments.create!(created_by: @admin, internal_notes: "Staff only")

    payload = Api::V1::ShowingAppointmentSerializer.consumer(showing)

    refute payload.key?(:internal_notes)
    refute payload.key?(:created_by)
    refute payload.key?(:created_by_id)
    refute payload.key?(:lead)
  end

  test "only exact showing detail includes the primary listing photo" do
    village = Village.create!(name: "Yigo Showing", slug: "yigo-showing-detail", region: "north")
    listing = Listing.create!(
      village: village,
      title: "Showing detail home",
      address: "123 Showing Lane",
      external_id: "SHOWING-DETAIL-1",
      listing_kind: "sale",
      property_type: "house",
      status: "active",
      price: 600_000
    )
    listing.listing_photos.create!(url: "https://example.test/showing-home.jpg", position: 1)
    showing = @alpha_lead.showing_appointments.create!(created_by: @admin, listing: listing)

    summary = Api::V1::ShowingAppointmentSerializer.summary(showing)
    detail = Api::V1::ShowingAppointmentSerializer.detail(showing)

    refute summary.fetch(:listing).key?(:primary_photo_url)
    assert_equal "https://example.test/showing-home.jpg", detail.dig(:listing, :primary_photo_url)
  end

  test "platform admins retain explicit cross-brokerage visibility" do
    platform_admin = create_user(email: "platform@example.com", role: "platform_admin", clerk_id: "clerk-platform")
    headers = authorization_headers(platform_admin)

    with_clerk_auth { get "/api/v1/leads", headers: headers }

    assert_response :success
    assert_equal [ @alpha_lead.id, @beta_lead.id ].sort, response.parsed_body.fetch("leads").pluck("id").sort
  end

  test "agents only receive audit events for leads assigned to their active profiles" do
    alpha_agent_user = create_user(email: "agent-one@alpha.test", role: "agent", clerk_id: "clerk-alpha-agent-one")
    other_agent_user = create_user(email: "agent-two@alpha.test", role: "agent", clerk_id: "clerk-alpha-agent-two")
    BrokerageMembership.create!(brokerage: @alpha, user: alpha_agent_user, role: "agent", status: "active")
    BrokerageMembership.create!(brokerage: @alpha, user: other_agent_user, role: "agent", status: "active")
    alpha_agent = Agent.create!(brokerage: @alpha, user: alpha_agent_user, name: "Agent One", email: alpha_agent_user.email)
    other_agent = Agent.create!(brokerage: @alpha, user: other_agent_user, name: "Agent Two", email: other_agent_user.email)
    assigned_lead = Lead.create!(brokerage: @alpha, assigned_agent: alpha_agent, lead_type: "contact", name: "Assigned Buyer", email: "assigned@example.com")
    other_lead = Lead.create!(brokerage: @alpha, assigned_agent: other_agent, lead_type: "contact", name: "Other Buyer", email: "other@example.com")
    assigned_event = AuditLogger.record!(action: "lead_updated", target: assigned_lead, lead: assigned_lead, metadata: { scope: "assigned" })
    AuditLogger.record!(action: "lead_updated", target: other_lead, lead: other_lead, metadata: { scope: "other_agent" })
    AuditLogger.record!(action: "brokerage_updated", target: @alpha, brokerage: @alpha, metadata: { scope: "brokerage" })

    headers = authorization_headers(alpha_agent_user)
    with_clerk_auth { get "/api/v1/admin/audit_events", headers: headers }

    assert_response :success
    assert_equal [ assigned_event.id ], response.parsed_body.fetch("audit_events").pluck("id")
  end

  test "brokerage admins retain brokerage-wide audit visibility" do
    alpha_event = AuditLogger.record!(action: "brokerage_updated", target: @alpha, brokerage: @alpha)
    AuditLogger.record!(action: "brokerage_updated", target: @beta, brokerage: @beta)

    headers = authorization_headers(@admin)
    with_clerk_auth { get "/api/v1/admin/audit_events", headers: headers }

    assert_response :success
    assert_equal [ alpha_event.id ], response.parsed_body.fetch("audit_events").pluck("id")
  end
end
