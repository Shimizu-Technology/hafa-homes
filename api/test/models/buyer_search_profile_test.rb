require "test_helper"

class BuyerSearchProfileTest < ActiveSupport::TestCase
  test "keeps one profile per user and brokerage" do
    user = create_user(email: "buyer@example.com")
    alpha = create_brokerage(name: "Alpha Realty", slug: "alpha")
    beta = create_brokerage(name: "Beta Realty", slug: "beta")

    alpha_profile = BuyerSearchProfile.create!(user: user, brokerage: alpha, desired_villages: "Tamuning")
    beta_profile = BuyerSearchProfile.create!(user: user, brokerage: beta, desired_villages: "Yigo")

    assert_equal [ alpha_profile, beta_profile ], user.buyer_search_profiles.order(:id).to_a
    assert_not BuyerSearchProfile.new(user: user, brokerage: alpha).valid?
  end
end
