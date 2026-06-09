module Api
  module V1
    class MeController < ApplicationController
      include ClerkAuthenticatable

      before_action :authenticate_user!

      def show
        render json: { user: current_user.as_api_json }
      end

      def leads
        leads = current_user.leads
          .includes(:brokerage, :assigned_agent, { showing_appointments: [:listing, :brokerage, :agent, :created_by] }, listing: [:village, :brokerage, :agent])
          .order(created_at: :desc)
          .limit(100)

        render json: { leads: leads.map { |lead| LeadSerializer.consumer(lead) } }
      end
    end
  end
end
