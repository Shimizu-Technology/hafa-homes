class AccountDeletionReconciliationJob < ApplicationJob
  queue_as :default

  INTERRUPTED_AFTER = 15.minutes
  BATCH_SIZE = 500

  def perform(now: Time.current)
    cutoff = INTERRUPTED_AFTER.before(now)
    AccountDeletion.processing_before(cutoff).find_each { |deletion| deletion.recover_interrupted!(cutoff: cutoff) }

    AccountDeletion.retryable.limit(BATCH_SIZE).pluck(:id).each do |deletion_id|
      AccountDeletionJob.perform_later(deletion_id)
    end
  end
end
