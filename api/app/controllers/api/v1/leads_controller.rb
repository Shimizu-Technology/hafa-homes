module Api
  module V1
    class LeadsController < ApplicationController
      include ClerkAuthenticatable

      before_action :authenticate_user!, only: [:index, :show, :update]
      before_action :require_staff!, only: [:index, :show, :update]
      before_action :authenticate_user_optional, only: [:create]
      before_action :set_lead, only: [:show, :update]

      def index
        leads = lead_scope.order(created_at: :desc).limit(100)

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

      private

      def set_lead
        @lead = lead_scope.find(params[:id])
      end

      def lead_scope
        base = Lead
          .includes(:brokerage, :assigned_agent, listing: [:village, :brokerage, :agent])

        return base if current_user.platform_admin?

        brokerage_ids = authorized_brokerage_ids
        agent_ids = authorized_agent_ids
        return base.none if brokerage_ids.empty? && agent_ids.empty?

        base.where(brokerage_id: brokerage_ids).or(base.where(assigned_agent_id: agent_ids))
      end

      def authorized_brokerage_ids
        @authorized_brokerage_ids ||= current_user.active_brokerage_ids
      end

      def authorized_agent_ids
        @authorized_agent_ids ||= current_user.active_agent_ids
      end

      def assignable_agents_for_scope
        return Agent.includes(:brokerage).active.order(:name) if current_user.platform_admin?

        Agent.includes(:brokerage).active.where(brokerage_id: authorized_brokerage_ids).order(:name)
      end

      def assignable_agents_for(lead)
        agents = assignable_agents_for_scope
        brokerage_id = lead.brokerage_id || lead.assigned_agent&.brokerage_id
        return agents if brokerage_id.blank?

        agents.where(brokerage_id: brokerage_id)
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

        @lead.assign_attributes(permitted)
        @lead.last_contacted_at = Time.current if permitted.key?(:status) && contact_status?(@lead.status)
        true
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
        params.require(:lead).permit(:status, :assigned_agent_id)
      end
    end
  end
end
