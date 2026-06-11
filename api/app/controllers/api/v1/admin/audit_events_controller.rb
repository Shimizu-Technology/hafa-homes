module Api
  module V1
    module Admin
      class AuditEventsController < ApplicationController
        include ClerkAuthenticatable

        DEFAULT_LIMIT = 100
        MAX_LIMIT = 250

        before_action :authenticate_user!
        before_action :require_staff!

        def index
          events = scoped_events
            .includes(:actor)
            .recent_first
            .limit(requested_limit)

          render json: { audit_events: events.map(&:as_api_json) }
        end

        private

        def scoped_events
          events = AuditEvent.all
          events = events.where(action: params[:event_action]) if params[:event_action].present?
          events = events.where(actor_id: params[:actor_id]) if params[:actor_id].present?
          events = events.where(target_type: params[:target_type]) if params[:target_type].present?
          events = events.where(target_id: params[:target_id]) if params[:target_id].present?
          events = events.where(lead_id: params[:lead_id]) if params[:lead_id].present?
          events = events.where("audit_events.created_at >= ?", Time.zone.parse(params[:from])) if params[:from].present?
          events = events.where("audit_events.created_at <= ?", Time.zone.parse(params[:to])) if params[:to].present?

          return events if current_user.platform_admin?

          brokerage_ids = current_user.active_brokerage_ids
          agent_lead_ids = current_user.agent? ? Lead.where(assigned_agent_id: current_user.active_agent_ids).select(:id) : Lead.none
          if brokerage_ids.any?
            events.where(brokerage_id: brokerage_ids).or(events.where(lead_id: agent_lead_ids))
          else
            events.where(lead_id: agent_lead_ids)
          end
        rescue ArgumentError
          AuditEvent.none
        end

        def requested_limit
          params.fetch(:limit, DEFAULT_LIMIT).to_i.clamp(1, MAX_LIMIT)
        end
      end
    end
  end
end
