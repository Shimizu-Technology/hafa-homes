class AccountDeletionReconciliationJob < ApplicationJob
  queue_as :default

  BATCH_SIZE = 500

  def perform(now: Time.current)
    AccountDeletion.expired_processing(now).find_each { |deletion| deletion.recover_interrupted!(now: now) }
    AccountDeletion.exhausted.find_each(&:mark_action_required!)

    AccountDeletion.retryable.limit(BATCH_SIZE).pluck(:id).each do |deletion_id|
      AccountDeletionJob.perform_later(deletion_id)
    end
  end
end
