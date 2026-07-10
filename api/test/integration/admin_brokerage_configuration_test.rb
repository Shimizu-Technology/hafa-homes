require "test_helper"

class AdminBrokerageConfigurationTest < ActionDispatch::IntegrationTest
  setup do
    @brokerage = create_brokerage(name: "Alpha Realty", slug: "alpha")
    @admin = create_user(email: "platform@example.com", role: "platform_admin", clerk_id: "clerk-platform")
    @headers = authorization_headers(@admin)
  end

  test "platform admin can configure domains and branding" do
    with_clerk_auth do
      patch "/api/v1/admin/brokerages/#{@brokerage.id}",
        headers: @headers,
        params: { brokerage: { app_display_name: "Alpha Homes", brand_primary_color: "#123456", brand_accent_color: "#abcdef" } }
    end
    assert_response :success
    assert_equal "Alpha Homes", @brokerage.reload.app_display_name

    with_clerk_auth do
      post "/api/v1/admin/brokerage_domains",
        headers: @headers,
        params: { brokerage_domain: { brokerage_id: @brokerage.id, hostname: "alpha.test", primary: true } }
    end
    assert_response :created
    first_domain = BrokerageDomain.find(response.parsed_body.dig("brokerage_domain", "id"))
    assert first_domain.primary?

    with_clerk_auth do
      post "/api/v1/admin/brokerage_domains",
        headers: @headers,
        params: { brokerage_domain: { brokerage_id: @brokerage.id, hostname: "search.alpha.test", primary: true } }
    end
    assert_response :created
    assert_not first_domain.reload.primary?
  end
end
