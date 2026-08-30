module Api
  module V1
    class AgentsController < ApplicationController
      include PaginatedResponse

      DEFAULT_LIMIT = 100
      MAX_LIMIT = 100

      def index
        brokerage = routing_brokerage!
        return unless brokerage

        agents = Agent.active.includes(:brokerage).where(brokerage: brokerage)

        total_count = agents.count
        limited_agents = agents.order(:name).limit(limit_param).offset(offset_param)

        render json: {
          agents: limited_agents.map(&:as_api_json),
          meta: {
            total_count: total_count,
            limit: limit_param,
            offset: offset_param
          }
        }
      end

      def show
        brokerage = routing_brokerage!
        return unless brokerage

        agent = brokerage.agents.active.includes(:brokerage).find(params[:id])
        attributed_listings = Listing.active
          .where(agent: agent)
          .includes(:village, :listing_photos, :features, :brokerage, :agent)
          .order(updated_at: :desc)
        response = paginated_response(attributed_listings, :attributed_listings, default_per_page: 6, max_per_page: 24) do |listing|
          Api::V1::ListingSerializer.summary(listing)
        end

        render json: response.merge(agent: agent.as_api_json)
      end

      private

      def routing_brokerage!
        brokerage = current_routing_brokerage
        return brokerage if brokerage

        render json: { errors: [ "No brokerage is configured for this domain" ] }, status: :not_found
        nil
      end

      def limit_param
        requested_limit = params[:limit].to_i
        requested_limit = DEFAULT_LIMIT unless requested_limit.positive?
        [ requested_limit, MAX_LIMIT ].min
      end

      def offset_param
        requested_offset = params[:offset].to_i
        requested_offset.positive? ? requested_offset : 0
      end
    end
  end
end
