class AccountDeletionJob < ApplicationJob
  class RetryableDeletionError < StandardError; end

  queue_as :default

  retry_on RetryableDeletionError, wait: :polynomially_longer, attempts: 10

  discard_on ActiveRecord::RecordNotFound

  def perform(account_deletion_id)
    deletion = AccountDeletion.find(account_deletion_id)
    return if deletion.completed?
    processing_token = deletion.claim_for_processing!
    return unless processing_token

    unless deletion.provider_deleted?
      result = ClerkAuth.delete_user(deletion.clerk_id)
      unless result[:success]
        retryable = deletion.mark_failed!("Identity-provider deletion is pending", processing_token: processing_token)
        raise RetryableDeletionError, "Identity-provider deletion is pending" if retryable

        return
      end

      return unless deletion.mark_provider_deleted!(processing_token: processing_token)
    end

    deletion.complete!(processing_token: processing_token)
  rescue ActiveRecord::RecordNotFound
    raise
  rescue RetryableDeletionError
    raise
  rescue StandardError => e
    retryable = deletion&.mark_failed!("Account purge is pending", processing_token: processing_token)
    Rails.logger.warn("Account deletion #{account_deletion_id} will retry after #{e.class}: #{e.message}")
    raise RetryableDeletionError, "Account purge is pending" if retryable
  end
end
