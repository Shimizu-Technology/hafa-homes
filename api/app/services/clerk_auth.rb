require "timeout"

class ClerkAuth
  JWKS_CACHE_KEY = "clerk_jwks"
  JWKS_CACHE_TTL = 1.hour
  DELETE_USER_TOTAL_TIMEOUT = 20

  class << self
    def verify(token, refreshed_jwks: false)
      return nil if token.blank?

      if Rails.env.test? && token.start_with?("test_token_")
        return handle_test_token(token)
      end

      jwks = fetch_jwks(force_refresh: refreshed_jwks)
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
      unless refreshed_jwks
        Rails.logger.warn("Clerk JWT decode error: #{e.message}; refreshing JWKS cache and retrying once")
        Rails.cache.delete(JWKS_CACHE_KEY)
        return verify(token, refreshed_jwks: true)
      end

      Rails.logger.warn("Clerk JWT decode error after JWKS refresh: #{e.message}")
      nil
    end

    def fetch_user_email(clerk_user_id)
      fetch_user_profile(clerk_user_id)&.dig(:email)
    end

    def fetch_user_profile(clerk_user_id)
      secret_key = ENV.fetch("CLERK_SECRET_KEY", nil)
      return nil unless secret_key.present? && clerk_user_id.present?

      response = HTTParty.get(
        "https://api.clerk.com/v1/users/#{clerk_user_id}",
        headers: clerk_api_headers(secret_key),
        timeout: 5
      )

      return nil unless response.success?

      data = response.parsed_response
      primary_id = data.dig("primary_email_address_id")
      addresses = data["email_addresses"] || []
      primary = addresses.find { |address| address["id"] == primary_id } || addresses.first
      phone_numbers = data["phone_numbers"] || []
      primary_phone_id = data["primary_phone_number_id"]
      primary_phone = phone_numbers.find { |phone| phone["id"] == primary_phone_id } || phone_numbers.first
      unsafe_metadata = data["unsafe_metadata"] || {}
      public_metadata = data["public_metadata"] || {}

      {
        email: primary&.dig("email_address"),
        first_name: data["first_name"].presence,
        last_name: data["last_name"].presence,
        phone: primary_phone&.dig("phone_number").presence || unsafe_metadata["phone"].presence || public_metadata["phone"].presence
      }
    rescue HTTParty::Error, Timeout::Error => e
      Rails.logger.warn("Clerk API profile fetch failed: #{e.class}")
      nil
    end

    def deletion_configured?
      ENV.fetch("CLERK_SECRET_KEY", nil).present?
    end

    def delete_user(clerk_user_id)
      secret_key = ENV.fetch("CLERK_SECRET_KEY", nil)
      unless secret_key.present?
        Rails.logger.error("CLERK_SECRET_KEY is required for account deletion")
        return { success: false, status: :not_configured, message: "Account deletion is not configured" }
      end

      if clerk_user_id.blank?
        return { success: false, status: :invalid_user, message: "Missing Clerk user ID" }
      end

      response = Timeout.timeout(DELETE_USER_TOTAL_TIMEOUT) do
        HTTParty.delete(
          "https://api.clerk.com/v1/users/#{clerk_user_id}",
          headers: clerk_api_headers(secret_key),
          timeout: 8
        )
      end

      if response.success? || response.code == 404
        return { success: true, status: response.code }
      end

      Rails.logger.warn("Clerk API account deletion failed: HTTP #{response.code}")
      { success: false, status: response.code, message: "Unable to delete Clerk account" }
    rescue HTTParty::Error, Timeout::Error => e
      Rails.logger.warn("Clerk API account deletion failed: #{e.class}")
      { success: false, status: :network_error, message: "Unable to reach Clerk" }
    end

    private

    def clerk_api_headers(secret_key)
      {
        "Authorization" => "Bearer #{secret_key}",
        "Content-Type" => "application/json"
      }
    end

    def fetch_jwks(force_refresh: false)
      cached = Rails.cache.read(JWKS_CACHE_KEY) unless force_refresh
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
      return "#{issuer.delete_suffix('/')}/.well-known/jwks.json" if issuer.present?

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
