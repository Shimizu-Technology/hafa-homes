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
    assert_equal true, response.parsed_body.fetch("deletion_pending")
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
    assert_equal "This account was deleted.", response.parsed_body.fetch("error")

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
    assert_nil audit.target_id
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
    AccountDeletionJob.singleton_class.remove_method(:perform_later) if AccountDeletionJob.singleton_methods(false).include?(:perform_later)
  end

  test "repeated deletion requests reuse the durable tombstone" do
    user = create_user(email: "repeat@example.com", clerk_id: "clerk-repeat")
    first = AccountDeletion.request_for!(user)
    second = AccountDeletion.request_for!(user.reload)

    assert_equal first.id, second.id
    assert_equal 1, AccountDeletion.where(clerk_id_digest: AccountDeletion.digest_for("clerk-repeat")).count
    assert user.reload.archived?
  end

  test "a unique-index conflict returns the concurrently-created tombstone" do
    user = create_user(email: "concurrent@example.com", clerk_id: "clerk-concurrent")
    digest = AccountDeletion.digest_for(user.clerk_id)
    winner = AccountDeletion.create!(clerk_id: user.clerk_id, clerk_id_digest: digest, status: "pending", requested_at: Time.current)
    original_lookup = AccountDeletion.method(:locked_tombstone)
    original_create = AccountDeletion.method(:create_tombstone!)
    lookup_calls = 0
    AccountDeletion.define_singleton_method(:locked_tombstone) do |requested_digest|
      lookup_calls += 1
      lookup_calls == 1 ? nil : original_lookup.call(requested_digest)
    end
    AccountDeletion.define_singleton_method(:create_tombstone!) do |*|
      raise ActiveRecord::RecordNotUnique, "simulated concurrent insert"
    end

    deletion = AccountDeletion.request_for!(user)

    assert_equal winner.id, deletion.id
    assert_equal digest, deletion.clerk_id_digest
    assert_equal 1, AccountDeletion.where(clerk_id_digest: digest).count
    assert user.reload.archived?
  ensure
    AccountDeletion.define_singleton_method(:locked_tombstone, original_lookup) if original_lookup
    AccountDeletion.define_singleton_method(:create_tombstone!, original_create) if original_create
    AccountDeletion.singleton_class.send(:private, :locked_tombstone, :create_tombstone!) if original_lookup && original_create
  end

  test "completion locks the user before revalidating the tombstone" do
    user = create_user(email: "lock-order@example.com", clerk_id: "clerk-lock-order")
    deletion = AccountDeletion.request_for!(user)
    token = deletion.claim_for_processing!
    deletion.mark_provider_deleted!(processing_token: token)
    lock_queries = []
    subscriber = ActiveSupport::Notifications.subscribe("sql.active_record") do |*, payload|
      sql = payload[:sql].to_s
      lock_queries << sql if sql.include?("FOR UPDATE")
    end

    deletion.complete!(processing_token: token)

    user_lock_index = lock_queries.index { |sql| sql.include?('FROM "users"') }
    deletion_lock_index = lock_queries.index { |sql| sql.include?('FROM "account_deletions"') }
    assert user_lock_index, "expected the user row to be locked"
    assert deletion_lock_index, "expected the tombstone row to be locked"
    assert_operator user_lock_index, :<, deletion_lock_index
  ensure
    ActiveSupport::Notifications.unsubscribe(subscriber) if subscriber
  end

  test "accepts and enqueues a durable deletion when audit logging fails" do
    user = create_user(email: "audit-outage@example.com", clerk_id: "clerk-audit-outage")
    headers = authorization_headers(user)

    with_singleton_stub(ClerkAuth, :verify, @clerk_claims) do
      with_singleton_stub(ClerkAuth, :deletion_configured?, true) do
        with_singleton_stub(AuditLogger, :record!, ->(**) { raise ActiveRecord::StatementInvalid, "audit unavailable" }) do
          assert_enqueued_with(job: AccountDeletionJob) do
            delete "/api/v1/me", headers: headers
          end
        end
      end
    end

    assert_response :accepted
    assert_equal "pending", AccountDeletion.find_by!(user: user).status
    assert user.reload.archived?
  end
end
