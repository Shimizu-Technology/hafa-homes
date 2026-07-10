class LeadIntentRetentionJob < ApplicationJob
  queue_as :default

  DEFAULT_ANONYMOUS_RETENTION_DAYS = 90

  def perform(now: Time.current)
    retention_days = ENV.fetch("LEAD_INTENT_ANONYMOUS_RETENTION_DAYS", DEFAULT_ANONYMOUS_RETENTION_DAYS).to_i
    retention_days = DEFAULT_ANONYMOUS_RETENTION_DAYS unless retention_days.positive?
    cutoff = retention_days.days.before(now)

    LeadIntentSession
      .where(user_id: nil, converted_lead_id: nil)
      .where("COALESCE(last_seen_at, updated_at, created_at) < ?", cutoff)
      .in_batches(of: 500, &:destroy_all)
  end
end
