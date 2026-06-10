module Api
  module V1
    class LeadsController < ApplicationController
      include ClerkAuthenticatable
      include StaffLeadScoping

      before_action :authenticate_user!, only: [:index, :show, :update, :send_notification]
      before_action :require_staff!, only: [:index, :show, :update, :send_notification]
      before_action :authenticate_user_optional, only: [:create]
      before_action :set_lead, only: [:show, :update, :send_notification]

      def index
        leads = staff_lead_scope.order(created_at: :desc).limit(100)

        render json: {
          leads: leads.map { |lead| LeadSerializer.summary(lead) },
          assignable_agents: assignable_agents_for_scope.map(&:as_api_json)
        }
      end

      def show
        render json: {
          lead: LeadSerializer.detail(@lead),
          assignable_agents: assignable_agents_for(@lead).map(&:as_api_json)
        }
      end

      def create
        permitted = lead_params
        lead = Lead.new(permitted.except(:listing_id))
        lead.listing = active_listing_from_params(permitted)
        return if performed?

        lead.user = current_user if current_user
        lead.queue_request_received_notification = true

        if lead.save
          render json: { lead: LeadSerializer.summary(lead) }, status: :created
        else
          render json: { errors: lead.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def update
        return if apply_lead_update_params == false

        if @lead.save
          render json: {
            lead: LeadSerializer.detail(@lead),
            assignable_agents: assignable_agents_for(@lead).map(&:as_api_json)
          }
        else
          render json: { errors: @lead.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def send_notification
        permitted = notification_params
        unless NotificationDelivery::CHANNELS.include?(permitted[:channel]) && NotificationDelivery::RECIPIENT_ROLES.include?(permitted[:recipient_role])
          return render json: { errors: ["Notification recipient or channel is invalid"] }, status: :unprocessable_entity
        end

        if permitted[:event_name].blank? || permitted[:event_name] == "manual_update"
          if permitted[:body].blank?
            return render json: { errors: ["Message body is required"] }, status: :unprocessable_entity
          end

          if permitted[:channel] == "email" && permitted[:subject].blank?
            return render json: { errors: ["Email subject is required"] }, status: :unprocessable_entity
          end
        end

        delivery = LeadNotificationService.queue_manual(
          @lead,
          channel: permitted[:channel],
          recipient_role: permitted[:recipient_role],
          event_name: permitted[:event_name].presence || "manual_update",
          sent_by: current_user,
          subject: permitted[:subject],
          title: permitted[:title],
          body: permitted[:body]
        )

        if delivery
          render json: { notification_delivery: NotificationDeliverySerializer.summary(delivery) }, status: :accepted
        else
          render json: { errors: ["No #{permitted[:recipient_role]} #{permitted[:channel]} recipient is available for this lead"] }, status: :unprocessable_entity
        end
      end

      private

      def set_lead
        @lead = staff_lead_scope.find(params[:id])
      end

      def apply_lead_update_params
        permitted = lead_update_params

        if permitted.key?(:assigned_agent_id)
          assigned_agent_id = permitted.delete(:assigned_agent_id)
          if assigned_agent_id.present?
            assigned_agent = assignable_agents_for(@lead).find_by(id: assigned_agent_id)
            unless assigned_agent
              render json: { errors: ["Assigned agent is not available for this lead"] }, status: :unprocessable_entity
              return false
            end

            @lead.assigned_agent = assigned_agent
            @lead.brokerage ||= assigned_agent.brokerage
          else
            @lead.assigned_agent = nil
          end
        end

        normalize_blank_update_values(permitted)
        @lead.assign_attributes(permitted)
        @lead.last_contacted_at = Time.current if permitted.key?(:status) && contact_status?(@lead.status)
        true
      end

      def normalize_blank_update_values(permitted)
        %i[phone preferred_time preferred_tour_date tour_type target_price message].each do |key|
          permitted[key] = nil if permitted.key?(key) && permitted[key].blank?
        end
      end

      def contact_status?(status)
        %w[contacted showing_scheduled nurturing closed lost].include?(status)
      end

      def lead_params
        params.require(:lead).permit(
          :lead_type,
          :name,
          :email,
          :phone,
          :preferred_contact_method,
          :preferred_time,
          :preferred_tour_date,
          :tour_type,
          :target_price,
          :message,
          :listing_id
        )
      end

      def active_listing_from_params(permitted)
        return nil if permitted[:listing_id].blank?

        Listing.active.find_by(id: permitted[:listing_id]).tap do |listing|
          render json: { errors: ["Listing not found"] }, status: :unprocessable_entity unless listing
        end
      end

      def lead_update_params
        params.require(:lead).permit(
          :status,
          :assigned_agent_id,
          :lead_type,
          :name,
          :email,
          :phone,
          :preferred_contact_method,
          :preferred_time,
          :preferred_tour_date,
          :tour_type,
          :target_price,
          :message
        )
      end

      def notification_params
        params.require(:notification).permit(:channel, :recipient_role, :event_name, :subject, :title, :body).tap do |permitted|
          permitted[:channel] = permitted[:channel].presence || "email"
          permitted[:recipient_role] = permitted[:recipient_role].presence || "consumer"
        end
      end
    end
  end
end
