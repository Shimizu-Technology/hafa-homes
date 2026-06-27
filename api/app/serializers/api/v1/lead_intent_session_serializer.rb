module Api
  module V1
    class LeadIntentSessionSerializer
      class << self
        def summary(session)
          return nil unless session

          summary = session.public_summary
          summary_payload(session, summary)
        end

        def admin_summary(session, include_events: false)
          return nil unless session

          summary = session.public_summary
          payload = summary_payload(session, summary).merge(
            user: user_json(session.user),
            identity_label: identity_label(session),
            brokerage: brokerage_json(session.brokerage),
            converted_lead: converted_lead_json(session.converted_lead),
            prompt_snoozed_until: session.prompt_snoozed_until,
            last_prompt_key: session.last_prompt_key,
            last_prompt_dismissed_at: session.summary["last_prompt_dismissed_at"],
            prompt_dismissal_count: session.summary["prompt_dismissal_count"].to_i,
            high_intent: high_intent?(summary)
          )
          payload[:recent_events] = recent_events_json(session) if include_events
          payload
        end

        private

        def summary_payload(session, summary)
          {
            id: session.id,
            status: session.status,
            prompt_mode: session.prompt_mode,
            last_seen_at: session.last_seen_at,
            converted_at: session.converted_at,
            requested_agent_id: session.requested_agent_id,
            requested_agent: agent_json(session.requested_agent),
            events_count: summary["events_count"].to_i,
            listing_view_count: summary["listing_view_count"].to_i,
            unique_listing_view_count: summary["unique_listing_view_count"].to_i,
            saved_listing_count: summary["saved_listing_count"].to_i,
            top_villages: summary["top_villages"] || [],
            viewed_price_min: summary["viewed_price_min"],
            viewed_price_max: summary["viewed_price_max"],
            latest_listing_id: summary["latest_listing_id"],
            latest_listing_title: summary["latest_listing_title"],
            form_open_count: summary["form_open_count"].to_i,
            form_abandon_count: summary["form_abandon_count"].to_i,
            search_filter_count: summary["search_filter_count"].to_i,
            agent_selected_count: summary["agent_selected_count"].to_i,
            narrative: narrative(summary)
          }
        end

        def agent_json(agent)
          return nil unless agent

          {
            id: agent.id,
            name: agent.name,
            brokerage_id: agent.brokerage_id
          }
        end

        def user_json(user)
          return nil unless user

          {
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            role: user.role
          }
        end

        def brokerage_json(brokerage)
          return nil unless brokerage

          {
            id: brokerage.id,
            name: brokerage.name,
            slug: brokerage.slug
          }
        end

        def converted_lead_json(lead)
          return nil unless lead

          {
            id: lead.id,
            name: lead.name,
            email: lead.email,
            status: lead.status
          }
        end

        def recent_events_json(session)
          events_for(session).map do |event|
            {
              id: event.id,
              event_name: event.event_name,
              label: event_label(event.event_name),
              source: event.source,
              occurred_at: event.occurred_at,
              metadata: event.metadata,
              listing: listing_json(event.listing),
              village: village_json(event.village || event.listing&.village),
              agent: agent_json(event.agent)
            }
          end
        end

        def events_for(session)
          if session.association(:lead_intent_events).loaded?
            session.lead_intent_events.sort_by { |event| [event.occurred_at || event.created_at, event.id] }.reverse.first(12)
          else
            session.lead_intent_events.includes(:village, :agent, listing: :village).order(occurred_at: :desc, id: :desc).limit(12)
          end
        end

        def listing_json(listing)
          return nil unless listing

          {
            id: listing.id,
            title: listing.title,
            price: listing.price&.to_f,
            listing_kind: listing.listing_kind,
            village: listing.village&.name,
            primary_photo_url: listing.primary_photo_url
          }
        end

        def village_json(village)
          return nil unless village

          {
            id: village.id,
            name: village.name
          }
        end

        def identity_label(session)
          return session.user.full_name if session.user

          "Anonymous visitor"
        end

        def high_intent?(summary)
          summary["unique_listing_view_count"].to_i >= 3 ||
            summary["saved_listing_count"].to_i.positive? ||
            summary["form_abandon_count"].to_i.positive? ||
            summary["agent_selected_count"].to_i.positive?
        end

        def event_label(event_name)
          event_name.to_s.humanize
        end

        def narrative(summary)
          parts = []
          unique_views = summary["unique_listing_view_count"].to_i
          parts << "viewed #{unique_views} unique listings" if unique_views.positive?
          saved_count = summary["saved_listing_count"].to_i
          parts << "saved #{saved_count} homes" if saved_count.positive?
          villages = Array(summary["top_villages"]).first(3).filter_map { |village| village["name"] }
          parts << "focused on #{villages.join(', ')}" if villages.any?
          price_min = summary["viewed_price_min"]
          price_max = summary["viewed_price_max"]
          parts << "viewed #{money(price_min)}–#{money(price_max)}" if price_min && price_max
          return nil if parts.empty?

          parts.join(" · ")
        end

        def money(value)
          "$#{value.to_i.to_fs(:delimited)}"
        end
      end
    end
  end
end
