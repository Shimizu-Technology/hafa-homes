require "test_helper"

class LeadIntentSessionTest < ActiveSupport::TestCase
  test "summarizes intent with database aggregates" do
    brokerage = create_brokerage(name: "Alpha Realty", slug: "alpha")
    village = Village.create!(name: "Tamuning", slug: "tamuning", region: "Central")
    listing = Listing.create!(
      village: village,
      brokerage: brokerage,
      title: "Tumon condo",
      listing_kind: "sale",
      property_type: "condo",
      status: "active",
      price: 500_000
    )
    session = LeadIntentSession.find_or_create_for_token!("intent-session-token-123", brokerage: brokerage)

    2.times do |index|
      session.record_event!(
        event_name: "listing_detail_viewed",
        client_event_id: "view-#{index}",
        brokerage: brokerage,
        listing: listing
      )
    end
    session.record_event!(event_name: "showing_form_opened", client_event_id: "form-open", brokerage: brokerage, listing: listing)

    session.reload
    assert_equal 3, session.events_count
    assert_equal 2, session.summary.fetch("listing_view_count")
    assert_equal 1, session.summary.fetch("unique_listing_view_count")
    assert_equal 1, session.summary.fetch("form_open_count")
    assert_equal({ "name" => "Tamuning", "count" => 2 }, session.summary.fetch("top_villages").first)
    assert_equal 500_000.0, session.summary.fetch("viewed_price_min")
  end
end
