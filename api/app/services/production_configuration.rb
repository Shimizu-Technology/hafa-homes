require "ipaddr"
require "uri"

class ProductionConfiguration
  class ConfigurationError < StandardError; end
  CGNAT_RANGE = IPAddr.new("100.64.0.0/10")

  class << self
    def validate!(environment = ENV)
      errors = []
      issuer = environment["CLERK_ISSUER"].to_s.strip
      secret_key = environment["CLERK_SECRET_KEY"].to_s.strip
      jwks_url = environment["CLERK_JWKS_URL"].to_s.strip
      web_origins = environment.fetch("WEB_ORIGINS", environment["WEB_ORIGIN"]).to_s
        .split(",")
        .map(&:strip)
        .reject(&:blank?)
      frontend_url = environment["FRONTEND_URL"].to_s.strip

      errors << "CLERK_ISSUER must be a public HTTPS URL" unless public_https_url?(issuer)
      errors << "CLERK_SECRET_KEY must be a live Clerk secret key" unless secret_key.match?(/\Ask_live_\S+\z/)
      errors << "WEB_ORIGINS or WEB_ORIGIN must contain only public HTTPS origins" unless web_origins.any? && web_origins.all? { |origin| public_https_url?(origin) }
      if frontend_url.present? && !public_https_url?(frontend_url)
        errors << "FRONTEND_URL must be a public HTTPS origin"
      end

      if jwks_url.present?
        expected_jwks = "#{issuer.delete_suffix('/')}/.well-known/jwks.json"
        errors << "CLERK_JWKS_URL must match CLERK_ISSUER or be removed" unless jwks_url == expected_jwks
      end

      if enabled?(environment["EMAIL_NOTIFICATIONS_ENABLED"])
        errors << "RESEND_API_KEY is required when email notifications are enabled" if environment["RESEND_API_KEY"].blank?
        errors << "RESEND_FROM_EMAIL or MAILER_FROM_EMAIL is required when email notifications are enabled" if environment["RESEND_FROM_EMAIL"].blank? && environment["MAILER_FROM_EMAIL"].blank?
      end

      if enabled?(environment["LIVE_SMS_ENABLED"])
        errors << "CLICKSEND_USERNAME is required when live SMS is enabled" if environment["CLICKSEND_USERNAME"].blank?
        errors << "CLICKSEND_API_KEY is required when live SMS is enabled" if environment["CLICKSEND_API_KEY"].blank?
      end

      raise ConfigurationError, "Production configuration is invalid: #{errors.join('; ')}" if errors.any?

      true
    end

    private

    def enabled?(value)
      ActiveModel::Type::Boolean.new.cast(value)
    end

    def public_https_url?(value)
      uri = URI.parse(value)
      uri.is_a?(URI::HTTPS) &&
        uri.host.present? &&
        uri.userinfo.blank? &&
        [ "", "/" ].include?(uri.path) &&
        uri.query.blank? &&
        uri.fragment.blank? &&
        !local_hostname?(uri.host)
    rescue URI::InvalidURIError
      false
    end

    def local_hostname?(hostname)
      normalized = hostname.delete_prefix("[").delete_suffix("]").delete_suffix(".").downcase
      address = IPAddr.new(normalized)
      address = address.native if address.ipv4_mapped?

      normalized == "localhost" || normalized.end_with?(".local") || address.private? || address.loopback? ||
        address.link_local? || address.to_i.zero? || CGNAT_RANGE.include?(address)
    rescue IPAddr::InvalidAddressError
      normalized == "localhost" || normalized.end_with?(".local")
    end
  end
end
