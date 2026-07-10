require "test_helper"

class AccountDeletionTest < ActionDispatch::IntegrationTest
  test "deletes account-owned data while preserving and detaching submitted requests" do
    brokerage = create_brokerage(name: "Alpha Realty", slug: "alpha")
    user = create_user(email: "buyer@example.com", clerk_id: "clerk-buyer")
    profile = BuyerSearchProfile.create!(user: user, brokerage: brokerage, desired_villages: "Tamuning")
    lead = Lead.create!(user: user, brokerage: brokerage, lead_type: "showing_request", name: "Buyer", email: user.email)
    headers = authorization_headers(user, "X-Brokerage-Slug" => brokerage.slug)

    with_singleton_stub(ClerkAuth, :verify, @clerk_claims) do
      with_singleton_stub(ClerkAuth, :deletion_configured?, true) do
        with_singleton_stub(ClerkAuth, :delete_user, { success: true, status: :ok, message: nil }) do
          delete "/api/v1/me", headers: headers
        end
      end
    end

    assert_response :success
    assert_not User.exists?(user.id)
    assert_not BuyerSearchProfile.exists?(profile.id)
    assert_nil lead.reload.user_id
  end
end
