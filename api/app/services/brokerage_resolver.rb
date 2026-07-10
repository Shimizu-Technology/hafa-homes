require "uri"

class BrokerageResolver
  class << self
    def resolve(request)
      by_slug(request.headers["X-Brokerage-Slug"]) ||
        by_hosts(host_candidates(request)) ||
        by_slug(ENV["DEFAULT_BROKERAGE_SLUG"]) ||
        single_active_brokerage
    end

    private

    def by_slug(slug)
      return nil if slug.blank?

      Brokerage.active.find_by(slug: slug.to_s.strip.downcase.parameterize)
    end

    def by_hosts(hosts)
      normalized_hosts = hosts.filter_map { |host| BrokerageDomain.normalize_hostname(host) }.uniq
      return nil if normalized_hosts.empty?

      BrokerageDomain.active
        .joins(:brokerage)
        .merge(Brokerage.active)
        .includes(:brokerage)
        .find_by("LOWER(brokerage_domains.hostname) IN (?)", normalized_hosts)&.brokerage
    end

    def host_candidates(request)
      candidates = [ request.headers["X-Brokerage-Host"], request.headers["X-Forwarded-Host"] ]
      candidates.concat([ host_from_url(request.origin), host_from_url(request.referer) ])
      candidates << request.host
      candidates.compact
    end

    def host_from_url(value)
      return nil if value.blank?

      URI.parse(value).host
    rescue URI::InvalidURIError
      nil
    end

    def single_active_brokerage
      active = Brokerage.active.limit(2).to_a
      active.one? ? active.first : nil
    end
  end
end
