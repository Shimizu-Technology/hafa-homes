# frozen_string_literal: true

require "digest"
require Rails.root.join("lib/environment_flag")

class Rack::Attack
  class << self
    def throttle_ip(request)
      remote_addr = request.get_header("REMOTE_ADDR").to_s
      trusted_proxies = Rails.application.config.action_dispatch.trusted_proxies.presence ||
        ActionDispatch::RemoteIp::TRUSTED_PROXIES

      return resolved_remote_ip(request) if remote_addr.blank?
      return resolved_remote_ip(request) if trusted_proxies.any? { |proxy| proxy === remote_addr }

      remote_addr
    end

    def bearer_fingerprint(request)
      token = request.get_header("HTTP_AUTHORIZATION").to_s[/\ABearer\s+(.+)\z/i, 1]
      Digest::SHA256.hexdigest(token) if token.present?
    end

    private

    def resolved_remote_ip(request)
      request.get_header("action_dispatch.remote_ip")&.to_s.presence || request.ip
    end
  end

  self.enabled = EnvironmentFlag.enabled?("ENABLE_RATE_LIMITING", default: Rails.env.production?)
  Rack::Attack.cache.store = Rails.cache

  limit_for = lambda do |name, default, maximum|
    ENV.fetch(name, default).to_i.clamp(1, maximum)
  end

  throttle(
    "public-leads/ip",
    limit: limit_for.call("PUBLIC_LEAD_RATE_LIMIT", 10, 1_000),
    period: 10.minutes
  ) do |request|
    throttle_ip(request) if request.post? && request.path == "/api/v1/leads"
  end

  throttle(
    "saved-searches/ip",
    limit: limit_for.call("SAVED_SEARCH_RATE_LIMIT", 10, 1_000),
    period: 1.hour
  ) do |request|
    throttle_ip(request) if request.post? && request.path == "/api/v1/saved_searches"
  end

  throttle(
    "lead-intent-events/ip",
    limit: limit_for.call("LEAD_INTENT_EVENT_RATE_LIMIT", 300, 10_000),
    period: 1.minute
  ) do |request|
    throttle_ip(request) if request.post? && request.path == "/api/v1/lead_intent/events"
  end

  throttle(
    "lead-intent-dismissals/ip",
    limit: limit_for.call("LEAD_INTENT_DISMISS_RATE_LIMIT", 60, 1_000),
    period: 1.minute
  ) do |request|
    throttle_ip(request) if request.post? && request.path == "/api/v1/lead_intent/dismiss"
  end

  throttle(
    "lead-notifications/token",
    limit: limit_for.call("LEAD_NOTIFICATION_RATE_LIMIT", 30, 1_000),
    period: 5.minutes
  ) do |request|
    next unless request.post? && request.path.match?(%r{\A/api/v1/leads/\d+/notifications\z})

    bearer_fingerprint(request) || "ip:#{throttle_ip(request)}"
  end

  self.throttled_responder = lambda do |request|
    match_data = request.env.fetch("rack.attack.match_data", {})
    period = match_data[:period].to_i
    period = 60 unless period.positive?
    epoch_time = match_data[:epoch_time].to_i
    epoch_time = Time.now.to_i unless epoch_time.positive?
    retry_after = [ period - (epoch_time % period), 1 ].max

    body = {
      errors: [ "Too many requests. Please wait and try again." ],
      code: "rate_limited",
      retry_after: retry_after
    }

    [
      429,
      {
        "Content-Type" => "application/json; charset=utf-8",
        "Cache-Control" => "no-store",
        "Retry-After" => retry_after.to_s
      },
      [ body.to_json ]
    ]
  end
end

# Rack::Attack's Railtie registers the middleware automatically. Move that one
# instance after RemoteIp so proxy-aware keys are ready and throttled responses
# bypass downstream cache/ETag rewriting.
Rails.application.config.middleware.move_after ActionDispatch::RemoteIp, Rack::Attack
