module Api
  module V1
    class ListingSerializer
      class << self
        def summary(listing)
          {
            id: listing.id,
            title: listing.title,
            status: listing.status,
            listing_kind: listing.listing_kind,
            property_type: listing.property_type,
            price: listing.price.to_f,
            address: listing.address,
            village: village_json(listing.village),
            beds: listing.beds,
            baths: listing.baths&.to_f,
            square_feet: listing.square_feet,
            latitude: listing.latitude&.to_f,
            longitude: listing.longitude&.to_f,
            primary_photo_url: listing.primary_photo_url,
            agent_name: listing.agent&.name || listing.agent_name,
            brokerage_name: listing.brokerage&.name || listing.brokerage_name,
            brokerage: brokerage_json(listing.brokerage),
            agent: agent_json(listing.agent),
            features: listing.features.map { |feature| feature_json(feature) }
          }
        end

        def detail(listing)
          summary(listing).merge(
            village: village_json(listing.village, include_local_intel: true),
            external_id: listing.external_id,
            source: listing.source,
            lot_square_feet: listing.lot_square_feet,
            year_built: listing.year_built,
            description: listing.description,
            agent_name: listing.agent&.name || listing.agent_name,
            brokerage_name: listing.brokerage&.name || listing.brokerage_name,
            published_at: listing.published_at,
            source_updated_at: listing.source_updated_at,
            photos: listing.listing_photos.map do |photo|
              { id: photo.id, url: photo.url, position: photo.position, alt_text: photo.alt_text }
            end
          )
        end

        private

        def village_json(village, include_local_intel: false)
          return nil unless village

          payload = {
            id: village.id,
            name: village.name,
            slug: village.slug,
            region: village.region
          }
          payload[:local_intel] = village.local_intel || {} if include_local_intel
          payload
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
            app_display_name: brokerage.app_display_name,
            compliance_disclaimer: brokerage.compliance_disclaimer
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
            license_number: agent.license_number,
            photo_url: agent.photo_url,
            bio: agent.bio,
            status: agent.status
          }
        end

        def feature_json(feature)
          { id: feature.id, name: feature.name, slug: feature.slug, category: feature.category }
        end
      end
    end
  end
end
