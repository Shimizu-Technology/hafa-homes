module Api
  module V1
    class ShowingAppointmentSerializer
      class << self
        def summary(showing)
          {
            id: showing.id,
            lead_id: showing.lead_id,
            listing_id: showing.listing_id,
            brokerage_id: showing.brokerage_id,
            agent_id: showing.agent_id,
            created_by_id: showing.created_by_id,
            scheduled_starts_at: showing.scheduled_starts_at,
            scheduled_ends_at: showing.scheduled_ends_at,
            timezone: showing.timezone,
            tour_type: showing.tour_type,
            status: showing.status,
            location: showing.location,
            consumer_notes: showing.consumer_notes,
            internal_notes: showing.internal_notes,
            created_at: showing.created_at,
            updated_at: showing.updated_at,
            listing: listing_json(showing.listing),
            brokerage: brokerage_json(showing.brokerage),
            agent: agent_json(showing.agent),
            created_by: user_json(showing.created_by)
          }
        end

        def detail(showing)
          summary(showing).merge(lead: lead_json(showing.lead))
        end

        def consumer(showing)
          return nil unless showing

          summary(showing).except(:internal_notes, :created_by, :created_by_id)
        end

        private

        def lead_json(lead)
          return nil unless lead

          {
            id: lead.id,
            lead_type: lead.lead_type,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            status: lead.status
          }
        end

        def listing_json(listing)
          return nil unless listing

          {
            id: listing.id,
            title: listing.title,
            address: listing.address,
            price: listing.price&.to_f,
            listing_kind: listing.listing_kind,
            property_type: listing.property_type,
            village: listing.village&.name,
            primary_photo_url: listing.primary_photo_url
          }
        end

        def brokerage_json(brokerage)
          return nil unless brokerage

          {
            id: brokerage.id,
            name: brokerage.name,
            slug: brokerage.slug,
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
            photo_url: agent.photo_url,
            status: agent.status
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
      end
    end
  end
end
