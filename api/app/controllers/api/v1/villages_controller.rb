module Api
  module V1
    class VillagesController < ApplicationController
      def index
        villages = Village.order(:region, :name)

        render json: {
          villages: villages.map { |village| village_json(village) }
        }
      end

      def show
        village = Village.find_by!(slug: params[:slug])

        render json: { village: village_json(village) }
      end

      private

      def village_json(village)
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
    end
  end
end
