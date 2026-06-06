# Basic API smoke checks for Hafa Homes.
# Run with: bin/rails runner script/smoke.rb

checks = {
  villages: Village.count,
  listings: Listing.count,
  features: Feature.count,
  sync_runs: DataSyncRun.count,
  brokerages: Brokerage.count,
  agents: Agent.count
}

missing = checks.select { |_key, count| count.zero? }

raise "Smoke check failed: missing #{missing.keys.join(', ')}" if missing.any?

sample = Listing.includes(:village, :features, :listing_photos).active.first
raise "Smoke check failed: no active listing" unless sample
raise "Smoke check failed: sample listing missing village" unless sample.village
raise "Smoke check failed: sample listing missing photo" unless sample.primary_photo_url
raise "Smoke check failed: sample listing missing brokerage" unless sample.brokerage
raise "Smoke check failed: sample listing missing agent" unless sample.agent

puts "Hafa Homes API smoke check passed: #{checks.to_json}"
