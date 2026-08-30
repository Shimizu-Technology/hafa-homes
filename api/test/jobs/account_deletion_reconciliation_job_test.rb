require "test_helper"

class AccountDeletionReconciliationJobTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  setup { clear_enqueued_jobs }
  teardown { clear_enqueued_jobs }

  test "recovers interrupted work and enqueues every retryable tombstone" do
    now = Time.zone.parse("2026-08-31 06:30:00")
    interrupted = deletion_for(
      "clerk-interrupted",
      status: "processing",
      updated_at: 20.minutes.before(now),
      processing_token: "expired-token",
      lease_expires_at: 1.minute.before(now)
    )
    in_flight = deletion_for(
      "clerk-in-flight",
      status: "processing",
      updated_at: 20.minutes.before(now),
      processing_token: "active-token",
      lease_expires_at: 1.minute.after(now)
    )
    failed = deletion_for("clerk-failed", status: "failed", updated_at: now)

    AccountDeletionReconciliationJob.perform_now(now: now)

    assert_equal "failed", interrupted.reload.status
    assert_equal "Recovered expired account-deletion lease", interrupted.last_error
    assert_equal "processing", in_flight.reload.status
    assert_equal "active-token", in_flight.processing_token
    assert_equal [ interrupted.id, failed.id ].sort, enqueued_jobs.filter_map { |job| job[:args].first if job[:job] == AccountDeletionJob }.sort
  end

  test "moves exhausted deletions to an operator-visible terminal state" do
    now = Time.zone.parse("2026-08-31 06:30:00")
    exhausted = deletion_for("clerk-exhausted", status: "failed", updated_at: now, attempt_count: AccountDeletion::MAX_ATTEMPTS)

    assert_no_enqueued_jobs only: AccountDeletionJob do
      AccountDeletionReconciliationJob.perform_now(now: now)
    end

    assert_equal "action_required", exhausted.reload.status
    assert AccountDeletion.blocks_clerk_id?("clerk-exhausted")
  end

  test "provider deadline is shorter than the durable processing lease" do
    assert_operator ClerkAuth::DELETE_USER_TOTAL_TIMEOUT, :<, AccountDeletion::PROCESSING_LEASE
  end

  private

  def deletion_for(clerk_id, status:, updated_at:, **attributes)
    user = create_user(email: "#{clerk_id}@example.com", clerk_id: clerk_id)
    deletion = AccountDeletion.request_for!(user)
    deletion.update_columns(status: status, updated_at: updated_at, **attributes)
    deletion
  end
end
