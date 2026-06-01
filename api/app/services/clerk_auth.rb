class ClerkAuth
  JWKS_CACHE_KEY = "clerk_jwks"
  JWKS_CACHE_TTL = 1.hour

  class << self
    def verify(token)
      return nil if token.blank?

      if Rails.env.test? && token.start_with?("test_token_")
        return handle_test_token(token)
      end

      jwks = fetch_jwks
      return nil unless jwks

      options = {
        algorithms: ["RS256"],
        jwks: jwks
      }
      audience = ENV.fetch("CLERK_AUDIENCE", ENV.fetch("CLERK_AUDIENCES", nil))
      if audience.present?
        options[:aud] = audience.split(",").map(&:strip)
        options[:verify_aud] = true
      end

      issuer = ENV.fetch("CLERK_ISSUER", nil)
      if issuer.present?
        options[:iss] = issuer
        options[:verify_iss] = true
      end

      decoded = JWT.decode(token, nil, true, options)
      decoded.first
    rescue JWT::ExpiredSignature
      Rails.logger.debug("Clerk JWT token expired")
      nil
    rescue JWT::DecodeError => e
      Rails.logger.warn("Clerk JWT decode error: #{e.message}")
      nil
    end

    def fetch_user_email(clerk_user_id)
      secret_key = ENV.fetch("CLERK_SECRET_KEY", nil)
      return nil unless secret_key.present? && clerk_user_id.present?

      response = HTTParty.get(
        "https://api.clerk.com/v1/users/#{clerk_user_id}",
        headers: { "Authorization" => "Bearer #{secret_key}" },
        timeout: 5
      )

      return nil unless response.success?

      data = response.parsed_response
      primary_id = data.dig("primary_email_address_id")
      addresses = data["email_addresses"] || []
      primary = addresses.find { |address| address["id"] == primary_id } || addresses.first
      primary&.dig("email_address")
    rescue HTTParty::Error, Timeout::Error => e
      Rails.logger.warn("Clerk API email fetch failed for #{clerk_user_id}: #{e.message}")
      nil
    end

    private

    def fetch_jwks
      cached = Rails.cache.read(JWKS_CACHE_KEY)
      return cached if cached.present?

      uri = jwks_url
      return nil unless uri

      response = HTTParty.get(uri, timeout: 5)
      unless response.success?
        Rails.logger.error("Failed to fetch Clerk JWKS: #{response.code}")
        return nil
      end

      jwks = response.parsed_response
      Rails.cache.write(JWKS_CACHE_KEY, jwks, expires_in: JWKS_CACHE_TTL)
      jwks
    rescue HTTParty::Error, Timeout::Error => e
      Rails.logger.error("Error fetching Clerk JWKS: #{e.message}")
      nil
    end

    def jwks_url
      jwks = ENV.fetch("CLERK_JWKS_URL", nil)
      return jwks if jwks.present?

      issuer = ENV.fetch("CLERK_ISSUER", nil)
      return "#{issuer}/.well-known/jwks.json" if issuer.present?

      Rails.logger.warn("Neither CLERK_JWKS_URL nor CLERK_ISSUER configured")
      nil
    end

    def handle_test_token(token)
      user_id = token.delete_prefix("test_token_")
      user = User.find_by(id: user_id)
      return nil unless user

      {
        "sub" => user.clerk_id,
        "email" => user.email,
        "first_name" => user.first_name,
        "last_name" => user.last_name
      }
    end
  end
end
