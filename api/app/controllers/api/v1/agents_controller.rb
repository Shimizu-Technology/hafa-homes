module Api
  module V1
    class AgentsController < ApplicationController
      DEFAULT_LIMIT = 100
      MAX_LIMIT = 100

      def index
        brokerage = current_routing_brokerage
        unless brokerage
          render json: { errors: [ "No brokerage is configured for this domain" ] }, status: :not_found
          return
        end

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

      private

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
