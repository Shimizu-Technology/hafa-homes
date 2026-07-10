namespace :privacy do
  desc "Delete expired anonymous, unconverted lead-intent sessions and their raw events"
  task prune_anonymous_intent: :environment do
    LeadIntentRetentionJob.perform_now
  end
end
