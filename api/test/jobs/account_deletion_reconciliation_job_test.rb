require "test_helper"

class AccountDeletionReconciliationJobTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  setup { clear_enqueued_jobs }
  teardown { clear_enqueued_jobs }

  test "recovers interrupted work and enqueues every retryable tombstone" do
    now = Time.zone.parse("2026-08-31 06:30:00")
    interrupted = deletion_for("clerk-interrupted", status: "processing", updated_at: 20.minutes.before(now))
    failed = deletion_for("clerk-failed", status: "failed", updated_at: now)

    assert_enqueued_with(job: AccountDeletionJob, args: [ interrupted.id ]) do
      assert_enqueued_with(job: AccountDeletionJob, args: [ failed.id ]) do
        AccountDeletionReconciliationJob.perform_now(now: now)
      end
    end

    assert_equal "failed", interrupted.reload.status
    assert_equal "Recovered interrupted account deletion", interrupted.last_error
  end

  private

  def deletion_for(clerk_id, status:, updated_at:)
    user = create_user(email: "#{clerk_id}@example.com", clerk_id: clerk_id)
    deletion = AccountDeletion.request_for!(user)
    deletion.update_columns(status: status, updated_at: updated_at)
    deletion
  end
end
