class AccountDeletionJob < ApplicationJob
  class RetryableDeletionError < StandardError; end

  queue_as :default

  retry_on RetryableDeletionError, wait: :polynomially_longer, attempts: 10

  discard_on ActiveRecord::RecordNotFound

  def perform(account_deletion_id)
    deletion = AccountDeletion.find(account_deletion_id)
    return if deletion.completed?
    return unless deletion.claim_for_processing!

    unless deletion.provider_deleted?
      result = ClerkAuth.delete_user(deletion.clerk_id)
      unless result[:success]
        deletion.mark_failed!("Identity-provider deletion is pending")
        raise RetryableDeletionError, "Identity-provider deletion is pending"
      end

      deletion.mark_provider_deleted!
    end

    deletion.complete!
  rescue RetryableDeletionError
    raise
  rescue StandardError => e
    deletion&.mark_failed!("Account purge is pending")
    Rails.logger.warn("Account deletion #{account_deletion_id} will retry after #{e.class}: #{e.message}")
    raise RetryableDeletionError, "Account purge is pending"
  end
end
