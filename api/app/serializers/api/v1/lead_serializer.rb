module Api
  module V1
    class LeadSerializer
      class << self
        def summary(lead)
          {
            id: lead.id,
            lead_type: lead.lead_type,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            preferred_contact_method: lead.preferred_contact_method,
            preferred_time: lead.preferred_time,
            preferred_tour_date: lead.preferred_tour_date,
            tour_type: lead.tour_type,
            target_price: lead.target_price&.to_f,
            message: lead.message,
            status: lead.status,
            quality_status: lead.quality_status,
            lead_source: lead.lead_source,
            last_contacted_at: lead.last_contacted_at,
            listing_id: lead.listing_id,
            user_id: lead.user_id,
            brokerage_id: lead.brokerage_id,
            assigned_agent_id: lead.assigned_agent_id,
            created_at: lead.created_at,
            updated_at: lead.updated_at,
            listing: listing_json(lead.listing),
            brokerage: brokerage_json(lead.brokerage),
            assigned_agent: agent_json(lead.assigned_agent)
          }
        end

        def detail(lead)
          summary(lead)
        end

        private

        def listing_json(listing)
          return nil unless listing

          {
            id: listing.id,
            title: listing.title,
            address: listing.address,
            price: listing.price.to_f,
            listing_kind: listing.listing_kind,
            property_type: listing.property_type,
            village: listing.village&.name,
            brokerage: brokerage_json(listing.brokerage),
            agent: agent_json(listing.agent)
          }
        end

        def brokerage_json(brokerage)
          return nil unless brokerage

          {
            id: brokerage.id,
            name: brokerage.name,
            slug: brokerage.slug,
            status: brokerage.status,
            phone: brokerage.phone,
            website_url: brokerage.website_url,
            app_display_name: brokerage.app_display_name
          }
        end

        def agent_json(agent)
          return nil unless agent

          {
            id: agent.id,
            brokerage_id: agent.brokerage_id,
            name: agent.name,
            email: agent.email,
            phone: agent.phone,
            status: agent.status
          }
        end
      end
    end
  end
end
