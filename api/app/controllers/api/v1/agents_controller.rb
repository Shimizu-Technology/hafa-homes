module Api
  module V1
    class AgentsController < ApplicationController
      def index
        agents = Agent.active.includes(:brokerage)
        if params[:brokerage_id].present?
          agents = agents.where(brokerage_id: params[:brokerage_id])
        elsif (brokerage = default_brokerage)
          agents = agents.where(brokerage: brokerage)
        end

        render json: { agents: agents.order(:name).map(&:as_api_json) }
      end

      private

      def default_brokerage
        Brokerage.active.order(:id).first
      end
    end
  end
end
