module Api
  module V1
    class ContextsController < ApplicationController
      def show
        brokerage = current_routing_brokerage
        unless brokerage
          render json: { errors: [ "No brokerage is configured for this domain" ] }, status: :not_found
          return
        end

        render json: { brokerage: brokerage.as_public_json }
      end
    end
  end
end
