class NotificationDeliveryReconciliationJob < ApplicationJob
  queue_as :default

  STALE_SENDING_AFTER = 15.minutes
  # Normal retry_on backoff completes well inside this window. Waiting longer
  # prevents reconciliation from racing a provider retry that is already scheduled.
  ORPHANED_QUEUE_AFTER = 15.minutes
  BATCH_SIZE = 500

  def perform(now: Time.current)
    cutoff = STALE_SENDING_AFTER.before(now)
    NotificationDelivery.sending_before(cutoff).find_each do |delivery|
      delivery.recover_interrupted!(cutoff: cutoff)
    end

    NotificationDelivery
      .queued_before(ORPHANED_QUEUE_AFTER.before(now))
      .limit(BATCH_SIZE)
      .pluck(:id)
      .each { |delivery_id| NotificationDeliveryJob.perform_later(delivery_id) }
  end
end
