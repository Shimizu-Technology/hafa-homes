module Api
  module V1
    class LeadIntentSessionSerializer
      class << self
        def summary(session)
          return nil unless session

          summary = session.public_summary
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

        private

        def agent_json(agent)
          return nil unless agent

          {
            id: agent.id,
            name: agent.name,
            brokerage_id: agent.brokerage_id
          }
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
