require "test_helper"

class ShowingAppointmentTest < ActiveSupport::TestCase
  setup do
    @alpha = create_brokerage(name: "Alpha Realty", slug: "alpha")
    @beta = create_brokerage(name: "Beta Realty", slug: "beta")
    @alpha_agent = Agent.create!(brokerage: @alpha, name: "Alpha Agent", email: "agent@alpha.test")
    @beta_agent = Agent.create!(brokerage: @beta, name: "Beta Agent", email: "agent@beta.test")
    @lead_listing = create_listing(external_id: "LEAD-LISTING", brokerage: @beta)
    @other_listing = create_listing(external_id: "OTHER-LISTING", brokerage: @alpha)
    @lead = Lead.create!(
      brokerage: @alpha,
      assigned_agent: @alpha_agent,
      listing: @lead_listing,
      lead_type: "showing_request",
      name: "Buyer",
      email: "buyer@example.test"
    )
  end

  test "brokerage must match the lead brokerage" do
    showing = @lead.showing_appointments.build(brokerage: @beta)

    assert_not showing.valid?
    assert_includes showing.errors[:brokerage], "must match the lead brokerage"
  end

  test "agent must belong to the showing brokerage" do
    showing = @lead.showing_appointments.build(agent: @beta_agent)

    assert_not showing.valid?
    assert_includes showing.errors[:agent], "is not available for this brokerage"
  end

  test "listing must match the lead listing when the lead names one" do
    showing = @lead.showing_appointments.build(listing: @other_listing)

    assert_not showing.valid?
    assert_includes showing.errors[:listing], "must match the lead listing"
  end

  test "listing attribution may belong to a different brokerage" do
    showing = @lead.showing_appointments.build

    assert showing.valid?
    assert_equal @alpha, showing.brokerage
    assert_equal @alpha_agent, showing.agent
    assert_equal @lead_listing, showing.listing
    assert_equal @beta, showing.listing.brokerage
  end

  test "a listing may be added when the lead does not name one" do
    lead = Lead.create!(brokerage: @alpha, lead_type: "contact", name: "Buyer", email: "other@example.test")
    showing = lead.showing_appointments.build(listing: @other_listing)

    assert showing.valid?
  end

  private

  def create_listing(external_id:, brokerage:)
    village = Village.create!(name: "Village #{external_id}", slug: external_id.downcase, region: "central")
    Listing.create!(
      village: village,
      brokerage: brokerage,
      title: "Home #{external_id}",
      address: "1 #{external_id} Lane",
      external_id: external_id,
      listing_kind: "sale",
      property_type: "house",
      status: "active",
      price: 500_000
    )
  end
end
