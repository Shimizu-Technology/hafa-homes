require "uri"

class BrokerageResolver
  LOCAL_DEVELOPMENT_HOSTS = %w[localhost 127.0.0.1 ::1].freeze

  class << self
    def resolve(request)
      explicit_storefront_hosts(request).each do |host|
        next if local_development_host?(host)

        # An explicit storefront is authoritative. Unknown or inactive domains
        # must not silently route customer data into a fallback brokerage.
        return by_hosts([ host ])
      end

      explicit_slug = request.headers["X-Brokerage-Slug"]
      return by_slug(explicit_slug) if explicit_slug.present?

      by_hosts(infrastructure_host_candidates(request)) ||
        by_slug(ENV["DEFAULT_BROKERAGE_SLUG"]) ||
        single_active_brokerage
    end

    private

    def by_slug(slug)
      return nil if slug.blank?

      normalized_slug = slug.to_s.b.strip.downcase
      return nil unless normalized_slug.match?(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/n)

      Brokerage.active.find_by(slug: normalized_slug.force_encoding(Encoding::UTF_8))
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

    def explicit_storefront_hosts(request)
      [
        request.headers["X-Brokerage-Host"],
        host_from_url(request.origin),
        host_from_url(request.referer)
      ].filter_map { |host| BrokerageDomain.normalize_hostname(host) }.uniq
    end

    def infrastructure_host_candidates(request)
      [ request.headers["X-Forwarded-Host"], request.host ].compact
    end

    def local_development_host?(host)
      LOCAL_DEVELOPMENT_HOSTS.include?(BrokerageDomain.normalize_hostname(host))
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
