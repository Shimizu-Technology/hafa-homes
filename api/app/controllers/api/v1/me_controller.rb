module Api
  module V1
    class MeController < ApplicationController
      include ClerkAuthenticatable

      before_action :authenticate_user!

      def show
        render json: { user: current_user.as_api_json }
      end
    end
  end
end
