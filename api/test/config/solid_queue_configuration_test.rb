require "test_helper"
require "erb"
require "yaml"

class SolidQueueConfigurationTest < ActiveSupport::TestCase
  test "the worker consumes recurring command jobs" do
    config_path = Rails.root.join("config/queue.yml")
    config = YAML.safe_load(ERB.new(config_path.read).result, aliases: true)
    worker_queues = config.fetch("test").fetch("workers").first.fetch("queues")

    assert_equal "solid_queue_recurring", SolidQueue::RecurringJob.new.queue_name
    assert_includes worker_queues, SolidQueue::RecurringJob.new.queue_name
  end
end
