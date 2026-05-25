module Api
  module V1
    class VillagesController < ApplicationController
      def index
        villages = Village.order(:region, :name)

        render json: {
          villages: villages.map do |village|
            {
              id: village.id,
              name: village.name,
              slug: village.slug,
              region: village.region,
              description: village.description,
              latitude: village.latitude&.to_f,
              longitude: village.longitude&.to_f,
              local_intel: village.local_intel || {},
              active_listings_count: village.listings.active.count
            }
          end
        }
      end
    end
  end
end
