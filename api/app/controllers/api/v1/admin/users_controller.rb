module Api
  module V1
    module Admin
      class UsersController < ApplicationController
        include ClerkAuthenticatable

        DEFAULT_LIMIT = 100
        MAX_LIMIT = 500

        before_action :authenticate_user!
        before_action :require_platform_admin!

        def index
          users = User.order(:role, :email).limit(requested_limit)
          render json: { users: users.map(&:as_api_json) }
        end

        private

        def requested_limit
          params.fetch(:limit, DEFAULT_LIMIT).to_i.clamp(1, MAX_LIMIT)
        end
      end
    end
  end
end
