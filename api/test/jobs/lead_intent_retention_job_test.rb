require "test_helper"

class LeadIntentRetentionJobTest < ActiveJob::TestCase
  test "deletes only expired anonymous unconverted sessions" do
    brokerage = create_brokerage(name: "Alpha Realty", slug: "alpha")
    expired = LeadIntentSession.create!(token_digest: Digest::SHA256.hexdigest("expired-session-token"), brokerage: brokerage, last_seen_at: 91.days.ago)
    current = LeadIntentSession.create!(token_digest: Digest::SHA256.hexdigest("current-session-token"), brokerage: brokerage, last_seen_at: 5.days.ago)
    user = create_user(email: "known@example.com")
    identified = LeadIntentSession.create!(token_digest: Digest::SHA256.hexdigest("identified-session-token"), brokerage: brokerage, user: user, last_seen_at: 120.days.ago)

    LeadIntentRetentionJob.perform_now(now: Time.current)

    assert_not LeadIntentSession.exists?(expired.id)
    assert LeadIntentSession.exists?(current.id)
    assert LeadIntentSession.exists?(identified.id)
  end
end
