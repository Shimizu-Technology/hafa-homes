# frozen_string_literal: true

require "cgi"

class LeadNotificationService
  BRAND_NAME = "Hafa Homes"

  class << self
    def queue_request_received(lead)
      deliveries = []
      deliveries << queue_delivery(lead: lead, channel: "email", recipient_role: "consumer", recipient: lead.email, event_name: "request_received")
      deliveries << queue_delivery(lead: lead, channel: "email", recipient_role: "agent", recipient: lead.assigned_agent&.email, event_name: "new_lead")
      deliveries.compact
    end

    def queue_showing_update(showing)
      lead = showing.lead
      deliveries = []
      deliveries << queue_delivery(lead: lead, showing_appointment: showing, channel: "email", recipient_role: "consumer", recipient: lead.email, event_name: "showing_update")
      deliveries << queue_delivery(lead: lead, showing_appointment: showing, channel: "sms", recipient_role: "consumer", recipient: lead.phone, event_name: "showing_update")
      deliveries << queue_delivery(lead: lead, showing_appointment: showing, channel: "email", recipient_role: "agent", recipient: showing.agent&.email || lead.assigned_agent&.email, event_name: "showing_update")
      deliveries.compact
    end

    def queue_manual(lead, channel:, recipient_role:, event_name: "manual_update", sent_by: nil, subject: nil, title: nil, body: nil)
      recipient = recipient_for(lead, channel: channel, recipient_role: recipient_role)
      queue_delivery(
        lead: lead,
        channel: channel,
        recipient_role: recipient_role,
        recipient: recipient,
        event_name: event_name,
        sent_by: sent_by,
        metadata: {
          subject: subject.presence,
          title: title.presence,
          body: body.presence
        }.compact
      )
    end

    def deliver!(delivery)
      return delivery.mark_skipped!("missing recipient") if delivery.recipient.blank?

      case delivery.channel
      when "email"
        deliver_email!(delivery)
      when "sms"
        deliver_sms!(delivery)
      else
        delivery.mark_failed!("unsupported channel")
      end
    end

    def email_configured?
      ActiveModel::Type::Boolean.new.cast(ENV["EMAIL_NOTIFICATIONS_ENABLED"]) &&
        ENV["RESEND_API_KEY"].present? &&
        from_email.present?
    end

    private

    def queue_delivery(lead:, channel:, recipient_role:, recipient:, event_name:, showing_appointment: nil, sent_by: nil, metadata: {})
      normalized_recipient = normalize_recipient(channel, recipient)
      return nil if normalized_recipient.blank?

      delivery = NotificationDelivery.create!(
        lead: lead,
        showing_appointment: showing_appointment,
        sent_by: sent_by,
        channel: channel,
        provider: channel == "email" ? "resend" : "clicksend",
        recipient_role: recipient_role,
        recipient: normalized_recipient,
        event_name: event_name,
        queued_at: Time.current,
        metadata: {
          lead_status: lead.status,
          listing_id: lead.listing_id,
          showing_status: showing_appointment&.status
        }.merge(metadata).compact
      )
      NotificationDeliveryJob.perform_later(delivery.id)
      delivery
    end

    def recipient_for(lead, channel:, recipient_role:)
      case recipient_role
      when "consumer"
        channel == "sms" ? lead.phone : lead.email
      when "agent"
        agent = lead.assigned_agent
        channel == "sms" ? agent&.phone : agent&.email
      end
    end

    def normalize_recipient(channel, recipient)
      return recipient.to_s.strip if channel == "email"

      ClicksendClient.normalize_phone(recipient)
    end

    def deliver_email!(delivery)
      return delivery.mark_skipped!("Email not sent because EMAIL_NOTIFICATIONS_ENABLED is false") unless ActiveModel::Type::Boolean.new.cast(ENV["EMAIL_NOTIFICATIONS_ENABLED"])
      return delivery.mark_skipped!("Email not sent because Resend configuration is missing") unless ENV["RESEND_API_KEY"].present? && from_email.present?

      response = Resend::Emails.send(
        {
          from: from_email,
          to: delivery.recipient,
          subject: email_subject(delivery),
          html: email_html(delivery)
        }
      )
      delivery.mark_sent!(provider_message_id: response.try(:[], "id") || response.try(:[], :id))
    rescue StandardError => e
      Rails.logger.error("[LeadNotificationService] Email failed delivery=#{delivery.id}: #{e.class} #{e.message}")
      delivery.mark_failed!(e.message)
    end

    def deliver_sms!(delivery)
      return delivery.mark_skipped!("SMS not sent because LIVE_SMS_ENABLED is false") unless ClicksendClient.live_enabled?
      return delivery.mark_skipped!("SMS not sent because ClickSend credentials are missing") unless ClicksendClient.configured?

      result = ClicksendClient.send_sms(to: delivery.recipient, body: sms_body(delivery))
      if result[:success]
        delivery.mark_sent!(provider_message_id: result[:message_id])
      else
        delivery.mark_failed!(result[:error] || "sms_failed")
      end
    end

    def email_subject(delivery)
      custom_subject = delivery.metadata["subject"].presence
      return custom_subject if custom_subject

      lead = delivery.lead
      listing_title = lead&.listing&.title || "your Hafa Homes request"

      case delivery.event_name
      when "request_received"
        "We received your Hafa Homes request"
      when "new_lead"
        "New Hafa Homes lead: #{lead&.name || 'Customer'}"
      when "showing_update"
        "Showing update for #{listing_title}"
      else
        "Hafa Homes update"
      end
    end

    def email_html(delivery)
      lead = delivery.lead
      showing = delivery.showing_appointment || lead&.showing_appointments&.order(Arel.sql("scheduled_starts_at DESC NULLS LAST"), created_at: :desc)&.first
      greeting = delivery.recipient_role == "agent" ? (lead&.assigned_agent&.name || showing&.agent&.name || "Team") : (lead&.name.presence || "there")
      cta_path = delivery.recipient_role == "agent" ? "/admin/leads/#{lead&.id}" : "/account/requests"
      cta_url = delivery.recipient_role == "agent" ? "#{frontend_url(delivery.lead)}#{cta_path}" : app_link_url(cta_path, lead: delivery.lead)
      body = email_body_copy(delivery, showing, greeting: greeting)

      <<~HTML
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>#{h(email_subject(delivery))}</title>
          </head>
          <body style="margin:0;padding:0;background-color:#f6f1e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#17211f;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f6f1e8;">
              <tr>
                <td align="center" style="padding:40px 16px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #e1d7c7;">
                    <tr><td style="height:6px;background:#0f3d35;font-size:0;line-height:0;">&nbsp;</td></tr>
                    <tr>
                      <td style="padding:30px 30px 0 30px;">
                        <p style="margin:0;color:#0f705e;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;font-weight:800;">#{h(BRAND_NAME)}</p>
                        <h1 style="margin:12px 0 0 0;color:#17211f;font-size:26px;line-height:1.2;font-weight:800;">#{h(email_title(delivery))}</h1>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:22px 30px 0 30px;">
                        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#304942;">Hi #{h(greeting)},</p>
                        <p style="margin:0;font-size:15px;line-height:1.7;color:#304942;">#{h(body)}</p>
                      </td>
                    </tr>
                    #{appointment_block(showing)}
                    #{listing_block(lead)}
                    <tr>
                      <td align="center" style="padding:26px 30px 0 30px;">
                        <a href="#{h(cta_url)}" target="_blank" style="display:inline-block;background-color:#0f3d35;color:#ffffff;text-decoration:none;border-radius:999px;padding:14px 28px;font-size:14px;font-weight:800;">
                          #{delivery.recipient_role == "agent" ? "Open lead" : "View my requests"}
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:28px 30px 30px 30px;">
                        <p style="margin:0;font-size:12px;line-height:1.6;color:#7b8a84;text-align:center;">You received this because this address is connected to a Hafa Homes request.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      HTML
    end

    def email_title(delivery)
      delivery.metadata["title"].presence || email_subject(delivery)
    end

    def email_body_copy(delivery, showing, greeting: nil)
      custom_body = delivery.metadata["body"].presence
      return strip_leading_greeting(custom_body, greeting) if custom_body

      case delivery.event_name
      when "request_received"
        "Your request has been received. A brokerage or agent will follow up with the next step."
      when "new_lead"
        "A new Hafa Homes lead is ready for follow-up. Open the lead to review contact details and listing interest."
      when "showing_update"
        showing_update_copy(showing)
      else
        "There is an update on this Hafa Homes request."
      end
    end

    def showing_update_copy(showing)
      return "There is an update on your showing request." unless showing

      case showing.status
      when "confirmed"
        "Your showing is confirmed. The appointment details are included below."
      when "proposed"
        "A showing time has been proposed. Please review the appointment details below."
      when "completed"
        "This showing has been marked complete."
      when "cancelled"
        "This showing was cancelled. The team can help coordinate another time."
      when "no_show"
        "This showing was marked as missed. The team can help coordinate another time."
      else
        "There is an update on your showing request."
      end
    end

    def appointment_block(showing)
      return "" unless showing

      <<~HTML
        <tr>
          <td style="padding:22px 30px 0 30px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f6f1e8;border-radius:18px;">
              <tr><td style="padding:18px;">
                <p style="margin:0 0 8px 0;color:#0f705e;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:800;">Showing details</p>
                <p style="margin:0;color:#17211f;font-size:16px;line-height:1.6;font-weight:800;">#{h(format_time(showing.scheduled_starts_at, timezone: showing.timezone))}</p>
                <p style="margin:6px 0 0 0;color:#53645f;font-size:14px;line-height:1.6;">#{h(showing.status.to_s.humanize)} · #{h(showing.tour_type.to_s.humanize)}</p>
                #{showing.location.present? ? "<p style=\"margin:6px 0 0 0;color:#53645f;font-size:14px;line-height:1.6;\">#{h(showing.location)}</p>" : ""}
                #{showing.consumer_notes.present? ? "<p style=\"margin:10px 0 0 0;color:#304942;font-size:14px;line-height:1.6;\">#{h(showing.consumer_notes)}</p>" : ""}
              </td></tr>
            </table>
          </td>
        </tr>
      HTML
    end

    def listing_block(lead)
      return "" unless lead&.listing

      <<~HTML
        <tr>
          <td style="padding:16px 30px 0 30px;">
            <p style="margin:0;color:#53645f;font-size:13px;line-height:1.7;"><strong style="color:#17211f;">#{h(lead.listing.title)}</strong><br>#{h(lead.listing.address)}</p>
          </td>
        </tr>
      HTML
    end

    def sms_body(delivery)
      lead = delivery.lead
      showing = delivery.showing_appointment
      listing = lead&.listing&.title || "your Hafa Homes request"

      custom_body = delivery.metadata["body"].presence
      return custom_body if custom_body

      case delivery.event_name
      when "showing_update"
        "Hafa Homes: #{showing&.status.to_s.humanize} showing for #{listing}. #{format_time(showing&.scheduled_starts_at, timezone: showing&.timezone)}. View details: #{app_link_url('/account/requests', lead: lead)}"
      else
        "Hafa Homes: update for #{listing}. View details: #{app_link_url('/account/requests', lead: lead)}"
      end
    end

    def format_time(value, timezone: "Pacific/Guam")
      return "Time to be confirmed" if value.blank?

      zone = ActiveSupport::TimeZone[timezone.presence || "Pacific/Guam"] || ActiveSupport::TimeZone["Pacific/Guam"]
      value.in_time_zone(zone).strftime("%b %-d at %-I:%M %p")
    end

    def from_email
      ENV["RESEND_FROM_EMAIL"].presence || ENV["MAILER_FROM_EMAIL"].presence
    end

    def app_link_url(path, lead:)
      "#{frontend_url(lead)}/open?target=#{CGI.escape(path)}"
    end

    def strip_leading_greeting(body, greeting)
      normalized = body.to_s.strip
      return normalized if greeting.blank?

      escaped = Regexp.escape(greeting.to_s.strip)
      normalized.sub(/\A(?:hi|hello|hafa|håfa)\s+#{escaped}\s*,?\s*/i, "").strip.presence || normalized
    end

    def frontend_url(lead = nil)
      hostname = lead&.brokerage&.brokerage_domains&.active&.order(primary: :desc, id: :asc)&.pick(:hostname)
      return "https://#{hostname}" if hostname.present? && hostname != "localhost"

      ENV.fetch("FRONTEND_URL") { ENV.fetch("WEB_ORIGIN", "http://localhost:5173").split(",").first.strip }
    end

    def h(value)
      CGI.escapeHTML(value.to_s)
    end
  end
end
