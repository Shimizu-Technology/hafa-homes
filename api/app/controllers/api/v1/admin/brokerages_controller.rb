module Api
  module V1
    module Admin
      class BrokeragesController < ApplicationController
        include ClerkAuthenticatable

        before_action :authenticate_user!
        before_action :require_staff!

        def index
          brokerages = brokerage_scope.order(:name)
          render json: { brokerages: brokerages.map(&:as_api_json) }
        end

        private

        def brokerage_scope
          return Brokerage.all if current_user.platform_admin?

          Brokerage.where(id: current_user.active_brokerage_admin_ids)
        end
      end
    end
  end
end
