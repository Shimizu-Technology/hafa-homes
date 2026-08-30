require "test_helper"

class LeadTest < ActiveSupport::TestCase
  setup do
    @alpha = create_brokerage(name: "Alpha Realty", slug: "alpha")
    @beta = create_brokerage(name: "Beta Realty", slug: "beta")
    @alpha_agent = Agent.create!(brokerage: @alpha, name: "Alpha Agent", email: "agent@alpha.test")
    @beta_agent = Agent.create!(brokerage: @beta, name: "Beta Agent", email: "agent@beta.test")
  end

  test "assigned agent must belong to the routing brokerage" do
    lead = Lead.new(
      brokerage: @alpha,
      assigned_agent: @beta_agent,
      lead_type: "contact",
      name: "Buyer",
      email: "buyer@example.test"
    )

    assert_not lead.valid?
    assert_includes lead.errors[:assigned_agent], "is not available for this brokerage"
  end

  test "assigned agent requires a routing brokerage" do
    lead = Lead.new(
      assigned_agent: @alpha_agent,
      lead_type: "contact",
      name: "Buyer",
      email: "buyer@example.test"
    )

    assert_not lead.valid?
    assert_includes lead.errors[:brokerage], "must be set before assigning an agent"
  end

  test "assigned agent may belong to the routing brokerage" do
    lead = Lead.new(
      brokerage: @alpha,
      assigned_agent: @alpha_agent,
      lead_type: "contact",
      name: "Buyer",
      email: "buyer@example.test"
    )

    assert lead.valid?
  end
end
