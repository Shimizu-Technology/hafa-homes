require "test_helper"

class BrokerageDomainTest < ActiveSupport::TestCase
  test "normalizes URL-like hostnames and enforces uniqueness" do
    brokerage = create_brokerage(name: "Alpha Realty", slug: "alpha")
    domain = BrokerageDomain.create!(brokerage: brokerage, hostname: "HTTPS://WWW.AlphaGuam.com/path")

    assert_equal "alphaguam.com", domain.hostname
    assert_not BrokerageDomain.new(brokerage: brokerage, hostname: "alpha guam").valid?
    assert_raises(ActiveRecord::RecordInvalid) do
      BrokerageDomain.create!(brokerage: brokerage, hostname: "www.alphaguam.com")
    end
  end
end
