module Api
  module V1
    module Admin
      class AgentsController < ApplicationController
        include ClerkAuthenticatable

        before_action :authenticate_user!
        before_action :require_staff!

        def index
          agents = agent_scope.includes(:brokerage).order(:name)
          render json: { agents: agents.map(&:as_api_json) }
        end

        private

        def agent_scope
          return Agent.all if current_user.platform_admin?

          brokerage_admin_ids = current_user.active_brokerage_admin_ids
          return Agent.where(brokerage_id: brokerage_admin_ids) if brokerage_admin_ids.any?

          Agent.where(id: current_user.active_agent_ids)
        end
      end
    end
  end
end
