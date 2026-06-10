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

      def destroy
        deletion = ClerkAuth.delete_user(current_user.clerk_id)
        unless deletion[:success]
          Rails.logger.warn("Unable to delete Clerk account for user #{current_user.id}: #{deletion[:status]} #{deletion[:message]}")
          render json: { error: "Account deletion is temporarily unavailable. Please contact support if this continues." }, status: account_deletion_failure_status(deletion[:status])
          return
        end

        current_user.destroy!
        render json: { deleted: true }
      end

      private

      def account_deletion_failure_status(status)
        status == :not_configured ? :service_unavailable : :bad_gateway
      end
    end
  end
end
