require "test_helper"

class AccountDeletionJobTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  setup { clear_enqueued_jobs }
  teardown { clear_enqueued_jobs }

  test "discards a missing tombstone without scheduling a retry" do
    assert_no_enqueued_jobs only: AccountDeletionJob do
      assert_nothing_raised { AccountDeletionJob.perform_now(-1) }
    end
  end

  test "an expired worker cannot mutate a deletion claimed by a new worker" do
    user = create_user(email: "fenced@example.com", clerk_id: "clerk-fenced")
    deletion = AccountDeletion.request_for!(user)
    first_token = deletion.claim_for_processing!(now: 5.minutes.ago)
    deletion.update_columns(lease_expires_at: 1.minute.ago)
    assert deletion.recover_interrupted!
    second_token = deletion.claim_for_processing!

    assert_not_equal first_token, second_token
    assert_not deletion.mark_provider_deleted!(processing_token: first_token)
    assert_equal "clerk-fenced", deletion.reload.clerk_id
    assert deletion.mark_provider_deleted!(processing_token: second_token)
  end

  test "the final failed attempt becomes action required without another retry" do
    user = create_user(email: "terminal@example.com", clerk_id: "clerk-terminal")
    deletion = AccountDeletion.request_for!(user)
    deletion.update_columns(status: "failed", attempt_count: AccountDeletion::MAX_ATTEMPTS - 1)
    token = deletion.claim_for_processing!

    assert_not deletion.mark_failed!("Provider rejected deletion", processing_token: token)
    assert_equal "action_required", deletion.reload.status
    assert_not_includes AccountDeletion.retryable, deletion
    assert AccountDeletion.blocks_clerk_id?("clerk-terminal")
  end
end
