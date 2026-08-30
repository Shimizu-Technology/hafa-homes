require "test_helper"

class AccountDeletionTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup { clear_enqueued_jobs }
  teardown { clear_enqueued_jobs }

  test "tombstones immediately, blocks authentication, and purges after provider confirmation" do
    brokerage = create_brokerage(name: "Alpha Realty", slug: "alpha")
    user = create_user(email: "buyer@example.com", clerk_id: "clerk-buyer")
    profile = BuyerSearchProfile.create!(user: user, brokerage: brokerage, desired_villages: "Tamuning")
    lead = Lead.create!(user: user, brokerage: brokerage, lead_type: "showing_request", name: "Buyer", email: user.email)
    audit = AuditLogger.record!(
      action: "profile_updated",
      actor: user,
      target: user,
      metadata: { email: user.email },
      changes: { phone: { from: nil, to: "+16715550123" } }
    )
    headers = authorization_headers(user, "X-Brokerage-Slug" => brokerage.slug)

    with_singleton_stub(ClerkAuth, :verify, @clerk_claims) do
      with_singleton_stub(ClerkAuth, :deletion_configured?, true) do
        assert_enqueued_with(job: AccountDeletionJob) do
          delete "/api/v1/me", headers: headers
        end
      end
    end

    assert_response :accepted
    assert_equal true, response.parsed_body.fetch("deleted")
    deletion = AccountDeletion.find_by!(clerk_id_digest: AccountDeletion.digest_for("clerk-buyer"))
    assert_equal "pending", deletion.status
    assert user.reload.archived?
    assert User.exists?(user.id)
    assert BuyerSearchProfile.exists?(profile.id)
    assert_equal user.id, lead.reload.user_id

    with_singleton_stub(ClerkAuth, :verify, @clerk_claims) do
      get "/api/v1/me", headers: headers
    end
    assert_response :forbidden

    with_singleton_stub(ClerkAuth, :delete_user, { success: true, status: 200, message: nil }) do
      AccountDeletionJob.new.perform(deletion.id)
    end

    assert_not User.exists?(user.id)
    assert_not BuyerSearchProfile.exists?(profile.id)
    assert_nil lead.reload.user_id
    deletion.reload
    assert_equal "completed", deletion.status
    assert_nil deletion.user_id
    assert_nil deletion.clerk_id
    assert deletion.provider_deleted_at
    assert deletion.completed_at
    audit.reload
    assert_nil audit.actor_id
    assert_nil audit.actor_email
    assert_equal "Deleted account", audit.target_label
    assert_equal({}, audit.metadata)
    assert_equal({}, audit.field_changes)

    with_singleton_stub(ClerkAuth, :verify, @clerk_claims) do
      get "/api/v1/me", headers: headers
    end
    assert_response :forbidden
    assert_not User.exists?(clerk_id: "clerk-buyer")
  end

  test "keeps the tombstone and retries durably when provider deletion fails" do
    user = create_user(email: "retry@example.com", clerk_id: "clerk-retry")
    headers = authorization_headers(user)

    with_singleton_stub(ClerkAuth, :verify, @clerk_claims) do
      with_singleton_stub(ClerkAuth, :deletion_configured?, true) do
        delete "/api/v1/me", headers: headers
      end
    end
    assert_response :accepted

    deletion = AccountDeletion.find_by!(user: user)
    with_singleton_stub(ClerkAuth, :delete_user, { success: false, status: :network_error, message: "provider detail" }) do
      assert_raises(AccountDeletionJob::RetryableDeletionError) { AccountDeletionJob.new.perform(deletion.id) }
    end

    deletion.reload
    assert_equal "failed", deletion.status
    assert_equal "Identity-provider deletion is pending", deletion.last_error
    assert user.reload.archived?
    assert_equal "clerk-retry", deletion.clerk_id

    with_singleton_stub(ClerkAuth, :delete_user, { success: true, status: 404, message: nil }) do
      AccountDeletionJob.new.perform(deletion.id)
    end

    assert_equal "completed", deletion.reload.status
    assert_not User.exists?(user.id)
  end

  test "does not tombstone an account when provider deletion is not configured" do
    user = create_user(email: "buyer@example.com", clerk_id: "clerk-not-configured")
    headers = authorization_headers(user)

    with_singleton_stub(ClerkAuth, :verify, @clerk_claims) do
      with_singleton_stub(ClerkAuth, :deletion_configured?, false) do
        delete "/api/v1/me", headers: headers
      end
    end

    assert_response :service_unavailable
    assert_not user.reload.archived?
    assert_not AccountDeletion.blocks_clerk_id?(user.clerk_id)
    assert_no_enqueued_jobs only: AccountDeletionJob
  end

  test "keeps a retryable tombstone when immediate queue insertion fails" do
    user = create_user(email: "queue@example.com", clerk_id: "clerk-queue")
    headers = authorization_headers(user)
    original_perform_later = AccountDeletionJob.method(:perform_later)
    AccountDeletionJob.define_singleton_method(:perform_later) { |*| raise ActiveJob::EnqueueError, "queue unavailable" }

    with_singleton_stub(ClerkAuth, :verify, @clerk_claims) do
      with_singleton_stub(ClerkAuth, :deletion_configured?, true) do
        delete "/api/v1/me", headers: headers
      end
    end

    assert_response :accepted
    deletion = AccountDeletion.find_by!(user: user)
    assert_equal "pending", deletion.status
    assert user.reload.archived?
  ensure
    AccountDeletionJob.define_singleton_method(:perform_later, original_perform_later) if original_perform_later
  end
end
