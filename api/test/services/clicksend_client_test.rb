require "test_helper"

class ClicksendClientTest < ActiveSupport::TestCase
  test "keeps provider error codes bounded and drops arbitrary response text" do
    assert_equal "invalid_recipient", ClicksendClient.send(:provider_error_code, "INVALID_RECIPIENT")
    assert_equal "provider_rejected", ClicksendClient.send(:provider_error_code, "Rejected for secret=value and buyer@example.com")
  end

  test "returns a stable network error without persisting exception details" do
    http = Object.new
    http.define_singleton_method(:use_ssl=) { |_| }
    http.define_singleton_method(:open_timeout=) { |_| }
    http.define_singleton_method(:read_timeout=) { |_| }
    http.define_singleton_method(:request) { |_| raise SocketError, "secret hostname and buyer@example.com" }
    original = Net::HTTP.method(:new)
    Net::HTTP.define_singleton_method(:new) { |*| http }

    result = ClicksendClient.send(:post_sms, messages: [])

    assert_equal({ success: false, error: "network_error" }, result)
  ensure
    Net::HTTP.define_singleton_method(:new, original) if original
  end
end
