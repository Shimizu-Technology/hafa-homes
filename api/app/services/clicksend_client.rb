# frozen_string_literal: true

require "base64"
require "json"
require "net/http"
require "uri"

class ClicksendClient
  BASE_URL = "https://rest.clicksend.com/v3"
  DEFAULT_SENDER_ID = "HafaHomes"

  class << self
    def configured?
      ENV["CLICKSEND_USERNAME"].present? && ENV["CLICKSEND_API_KEY"].present?
    end

    def live_enabled?
      ActiveModel::Type::Boolean.new.cast(ENV["LIVE_SMS_ENABLED"])
    end

    def send_sms(to:, body:, from: nil)
      return { success: false, error: "missing_credentials" } unless configured?
      return { success: false, error: "live_sms_disabled" } unless live_enabled?

      formatted_to = normalize_phone(to)
      return { success: false, error: "invalid_phone" } if formatted_to.blank?

      sender = (from.presence || ENV["CLICKSEND_SENDER_ID"].presence || DEFAULT_SENDER_ID)[0...11]
      encoded_body = sanitize_body(body)
      payload = {
        messages: [
          {
            source: "hafa_homes",
            from: sender,
            body: encoded_body,
            to: formatted_to
          }
        ]
      }

      Rails.logger.info("[ClicksendClient] Sending SMS to #{mask_phone(formatted_to)} (#{encoded_body.length} chars)")
      response = post_sms(payload)
      return response if response[:success] == false

      json = response[:json]
      if json["response_code"] == "SUCCESS"
        message_id = json.dig("data", "messages", 0, "message_id") || "unknown"
        { success: true, message_id: message_id }
      else
        { success: false, error: json["response_code"].presence || json["response_msg"].presence || "api_error" }
      end
    end

    def normalize_phone(phone)
      digits = phone.to_s.gsub(/\D/, "")
      return "+1#{digits}" if digits.match?(/\A671\d{7}\z/)
      return "+#{digits}" if digits.match?(/\A1671\d{7}\z/)
      return "+1671#{digits}" if digits.match?(/\A\d{7}\z/)
      return "+1#{digits}" if digits.match?(/\A\d{10}\z/)

      nil
    end

    def sanitize_body(body)
      body.to_s.gsub("$", "USD ").squish
    end

    def mask_phone(phone)
      return "[blank]" if phone.blank?

      phone.to_s.gsub(/\d(?=\d{4})/, "*")
    end

    private

    def post_sms(payload)
      auth = Base64.strict_encode64("#{ENV['CLICKSEND_USERNAME']}:#{ENV['CLICKSEND_API_KEY']}")
      uri = URI("#{BASE_URL}/sms/send")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.open_timeout = 10
      http.read_timeout = 30

      request = Net::HTTP::Post.new(uri.request_uri, {
        "Authorization" => "Basic #{auth}",
        "Content-Type" => "application/json"
      })
      request.body = payload.to_json

      response = http.request(request)
      json = JSON.parse(response.body) rescue {}
      return { success: true, json: json } if response.code.to_i == 200

      Rails.logger.error("[ClicksendClient] HTTP #{response.code}: #{response.body}")
      { success: false, error: "http_#{response.code}" }
    rescue StandardError => e
      Rails.logger.error("[ClicksendClient] HTTP error: #{e.class} #{e.message}")
      { success: false, error: e.message }
    end
  end
end
