module Api
  module V1
    module Admin
      class UsersController < ApplicationController
        include ClerkAuthenticatable

        before_action :authenticate_user!
        before_action :require_platform_admin!

        def index
          users = User.order(:role, :email)
          render json: { users: users.map(&:as_api_json) }
        end
      end
    end
  end
end
