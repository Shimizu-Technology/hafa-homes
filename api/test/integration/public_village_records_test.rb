require "test_helper"

class PublicVillageRecordsTest < ActionDispatch::IntegrationTest
  setup do
    brokerage = create_brokerage(name: "Village Realty", slug: "village-realty")
    agent = Agent.create!(brokerage: brokerage, name: "Village Agent")
    @village = Village.create!(
      name: "Yigo",
      slug: "yigo",
      region: "north",
      description: "Northern village context",
      local_intel: { "summary" => "Close to Andersen." }
    )
    Listing.create!(
      village: @village,
      brokerage: brokerage,
      agent: agent,
      title: "Active Yigo home",
      listing_kind: "sale",
      property_type: "house",
      status: "active",
      price: 650_000
    )
    Listing.create!(
      village: @village,
      brokerage: brokerage,
      agent: agent,
      title: "Inactive Yigo home",
      listing_kind: "sale",
      property_type: "house",
      status: "inactive",
      price: 625_000
    )
  end

  test "show returns the exact village record with active inventory count" do
    get "/api/v1/villages/yigo"

    assert_response :success
    payload = response.parsed_body.fetch("village")
    assert_equal @village.id, payload.fetch("id")
    assert_equal "yigo", payload.fetch("slug")
    assert_equal "Northern village context", payload.fetch("description")
    assert_equal 1, payload.fetch("active_listings_count")
    assert_equal "Close to Andersen.", payload.dig("local_intel", "summary")
  end

  test "show returns not found for an unknown village slug" do
    get "/api/v1/villages/not-a-village"

    assert_response :not_found
  end
end
