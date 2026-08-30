require "test_helper"

class PaginationContractTest < ActionDispatch::IntegrationTest
  setup do
    @alpha = create_brokerage(name: "Alpha Realty", slug: "alpha")
    @beta = create_brokerage(name: "Beta Realty", slug: "beta")
    BrokerageDomain.create!(brokerage: @alpha, hostname: "alpha.test")
    @admin = create_user(email: "admin@alpha.test", role: "brokerage_admin", clerk_id: "clerk-alpha-pagination-admin")
    BrokerageMembership.create!(brokerage: @alpha, user: @admin, role: "brokerage_admin", status: "active")
    @headers = authorization_headers(@admin)
  end

  test "paginates the scoped lead inbox after applying its stable ordering" do
    alpha_leads = 5.times.map do |index|
      Lead.create!(brokerage: @alpha, lead_type: index.zero? ? "price_tracker" : "contact", name: "Alpha Buyer #{index}", email: "alpha-#{index}@example.com")
    end
    Lead.create!(brokerage: @beta, lead_type: "contact", name: "Beta Buyer", email: "beta@example.com")

    with_clerk_auth { get "/api/v1/leads", headers: @headers, params: { page: 2, per_page: 2 } }

    assert_response :success
    assert_equal alpha_leads.reverse.slice(2, 2).map(&:id), response.parsed_body.fetch("leads").pluck("id")
    assert_equal pagination(page: 2, per_page: 2, total_count: 5, total_pages: 3, previous_page: 1, next_page: 3), response.parsed_body.fetch("pagination")
    assert_equal 5, response.parsed_body.dig("metrics", "open_leads")
    assert_equal 1, response.parsed_body.dig("metrics", "price_watch_leads")
  end

  test "paginates consumer requests inside the active storefront" do
    buyer = create_user(email: "buyer@example.com", clerk_id: "clerk-buyer-pagination")
    requests = 3.times.map do |index|
      Lead.create!(user: buyer, brokerage: @alpha, lead_type: "contact", name: "Buyer", email: buyer.email, message: "Request #{index}")
    end
    Lead.create!(user: buyer, brokerage: @beta, lead_type: "contact", name: "Buyer", email: buyer.email)
    headers = authorization_headers(buyer).merge("X-Brokerage-Host" => "alpha.test")

    with_clerk_auth { get "/api/v1/me/leads", headers: headers, params: { page: 2, per_page: 2 } }

    assert_response :success
    assert_equal [ requests.first.id ], response.parsed_body.fetch("leads").pluck("id")
    assert_equal pagination(page: 2, per_page: 2, total_count: 3, total_pages: 2, previous_page: 1, next_page: nil), response.parsed_body.fetch("pagination")
  end

  test "paginates scoped showings and keeps the scheduled ordering" do
    leads = 3.times.map do |index|
      Lead.create!(brokerage: @alpha, lead_type: "showing_request", name: "Showing Buyer #{index}", email: "showing-#{index}@example.com")
    end
    showings = leads.each_with_index.map do |lead, index|
      lead.showing_appointments.create!(created_by: @admin, scheduled_starts_at: Time.zone.parse("2026-09-0#{index + 1} 10:00:00"))
    end

    with_clerk_auth { get "/api/v1/showing_appointments", headers: @headers, params: { page: 2, per_page: 2 } }

    assert_response :success
    assert_equal [ showings.first.id ], response.parsed_body.fetch("showing_appointments").pluck("id")
    assert_equal pagination(page: 2, per_page: 2, total_count: 3, total_pages: 2, previous_page: 1, next_page: nil), response.parsed_body.fetch("pagination")
  end

  test "paginates audit history after staff visibility rules" do
    events = 3.times.map do |index|
      AuditLogger.record!(action: "lead_updated", brokerage: @alpha, target_label: "Alpha event #{index}")
    end
    AuditLogger.record!(action: "lead_updated", brokerage: @beta, target_label: "Beta event")

    with_clerk_auth { get "/api/v1/admin/audit_events", headers: @headers, params: { page: 2, per_page: 2 } }

    assert_response :success
    assert_equal [ events.first.id ], response.parsed_body.fetch("audit_events").pluck("id")
    assert_equal pagination(page: 2, per_page: 2, total_count: 3, total_pages: 2, previous_page: 1, next_page: nil), response.parsed_body.fetch("pagination")
  end

  test "clamps oversized page sizes to the endpoint maximum" do
    Lead.create!(brokerage: @alpha, lead_type: "contact", name: "Alpha Buyer", email: "alpha@example.com")

    with_clerk_auth { get "/api/v1/leads", headers: @headers, params: { per_page: 10_000 } }

    assert_response :success
    assert_equal 100, response.parsed_body.dig("pagination", "per_page")
  end

  test "keeps the audit log's previous limit parameter as a page-size alias" do
    3.times do |index|
      AuditLogger.record!(action: "lead_updated", brokerage: @alpha, target_label: "Alpha event #{index}")
    end

    with_clerk_auth { get "/api/v1/admin/audit_events", headers: @headers, params: { limit: 2 } }

    assert_response :success
    assert_equal 2, response.parsed_body.fetch("audit_events").size
    assert_equal 2, response.parsed_body.dig("pagination", "per_page")
    assert_equal 3, response.parsed_body.dig("pagination", "total_count")
  end

  private

  def pagination(page:, per_page:, total_count:, total_pages:, previous_page:, next_page:)
    {
      "page" => page,
      "per_page" => per_page,
      "total_count" => total_count,
      "total_pages" => total_pages,
      "previous_page" => previous_page,
      "next_page" => next_page
    }
  end
end
