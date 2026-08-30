module Api
  module V1
    class MeController < ApplicationController
      include ClerkAuthenticatable
      include PaginatedResponse

      before_action :authenticate_user!
      before_action :require_request_brokerage!, only: [ :leads, :lead ]

      def show
        render json: { user: current_user.as_api_json }
      end

      def update
        current_user.assign_attributes(me_params)

        if current_user.save
          changes = AuditLogger.change_details(current_user.previous_changes, %w[first_name last_name phone preferred_contact_method])
          record_audit_event(action: "profile_updated", target: current_user, changes: changes) if changes.any?
          render json: { user: current_user.as_api_json }
        else
          render json: { errors: current_user.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def leads
        leads = consumer_request_scope
          .order(created_at: :desc)

        response = paginated_response(leads, :leads, default_per_page: 100, max_per_page: 100) do |lead|
          LeadSerializer.consumer(lead)
        end
        render json: response
      end

      def lead
        lead = consumer_request_scope.find(params[:id])
        render json: { lead: LeadSerializer.consumer(lead) }
      end

      def destroy
        unless ClerkAuth.deletion_configured?
          Rails.logger.error("CLERK_SECRET_KEY is required for account deletion")
          render json: { error: "Account deletion is temporarily unavailable. Please contact support if this continues." }, status: :service_unavailable
          return
        end

        begin
          deletion = AccountDeletion.request_for!(current_user)
        rescue ActiveRecord::ActiveRecordError => e
          Rails.logger.warn("Unable to begin account deletion for user #{current_user.id}: #{e.class} #{e.message}")
          render json: { error: "Account deletion could not be completed. Please try again or contact support." }, status: :unprocessable_entity
          return
        end

        begin
          record_audit_event(action: "account_deletion_requested", target: current_user, target_label: "User ##{current_user.id}")
        rescue StandardError => e
          Rails.logger.warn("Unable to record account deletion audit event for user #{current_user.id}: #{e.class} #{e.message}")
        end

        begin
          AccountDeletionJob.perform_later(deletion.id)
        rescue StandardError => e
          Rails.logger.warn("Account deletion #{deletion.id} was saved but could not be enqueued immediately: #{e.class} #{e.message}")
        end

        render json: { deleted: true, deletion_pending: true }, status: :accepted
      end

      private

      def consumer_request_scope
        current_user.leads
          .where(brokerage: current_routing_brokerage)
          .includes(:brokerage, :requested_agent, :assigned_agent, { showing_appointments: [ :listing, :brokerage, :agent, :created_by ] }, listing: [ :village, :brokerage, :agent ])
      end

      def require_request_brokerage!
        return if current_routing_brokerage

        render json: { errors: [ "No brokerage is configured for this storefront" ] }, status: :not_found
      end

      def me_params
        params.require(:user).permit(:first_name, :last_name, :phone, :preferred_contact_method).tap do |permitted|
          permitted[:preferred_contact_method] = nil if permitted.key?(:preferred_contact_method) && permitted[:preferred_contact_method].blank?
          permitted[:phone] = nil if permitted.key?(:phone) && permitted[:phone].blank?
        end
      end
    end
  end
end
