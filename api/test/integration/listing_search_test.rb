require "test_helper"

class ListingSearchTest < ActionDispatch::IntegrationTest
  setup do
    @yigo = Village.create!(name: "Yigo", slug: "yigo-search-test", region: "north")
    @tamuning = Village.create!(name: "Tamuning", slug: "tamuning-search-test", region: "central")
    @andersen = Feature.create!(name: "Near Andersen AFB", slug: "near-andersen-search-test", category: "commute")

    @north_home = Listing.create!(
      village: @yigo,
      title: "Quiet northern home",
      address: "123 Marine Corps Drive",
      external_id: "MLS-SEARCH-100",
      listing_kind: "sale",
      property_type: "house",
      status: "active",
      price: 650_000,
      published_at: Time.current
    )
    @north_home.features << @andersen

    @central_condo = Listing.create!(
      village: @tamuning,
      title: "Central condo",
      address: "456 Pale San Vitores Road",
      external_id: "MLS-SEARCH-200",
      listing_kind: "sale",
      property_type: "condo",
      status: "active",
      price: 450_000,
      published_at: 1.minute.ago
    )
  end

  test "searches listing copy, address, listing id, village, and features" do
    {
      "northern" => @north_home,
      "Marine Corps" => @north_home,
      "MLS-SEARCH-100" => @north_home,
      "YIGO" => @north_home,
      "Andersen" => @north_home,
      "Central condo" => @central_condo
    }.each do |query, expected|
      get "/api/v1/listings", params: { q: query }

      assert_response :success
      assert response.parsed_body.fetch("listings").pluck("id").include?(expected.id), query
    end
  end
end
