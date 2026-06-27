module Api
  module V1
    module Admin
      class LeadIntentSessionsController < ApplicationController
        include ClerkAuthenticatable

        before_action :authenticate_user!
        before_action :require_staff!

        def index
          scope = staff_intent_session_scope
          sessions = filtered_scope(scope)
            .includes(:user, :brokerage, :requested_agent, :converted_lead)
            .order(Arel.sql("last_seen_at DESC NULLS LAST"), updated_at: :desc)
            .limit(100)
            .to_a

          metric_sessions = scope.where("last_seen_at >= ?", 14.days.ago).limit(500).to_a

          render json: {
            lead_intent_sessions: sessions.map { |session| Api::V1::LeadIntentSessionSerializer.admin_summary(session, include_events: true) },
            metrics: metrics_for(metric_sessions),
            top_villages: top_villages_for(metric_sessions)
          }
        end

        private

        def filtered_scope(scope)
          filtered = scope
          filtered = filtered.where(status: params[:status]) if params[:status].present? && LeadIntentSession::STATUSES.include?(params[:status])
          case params[:identity]
          when "signed_in"
            filtered.where.not(user_id: nil)
          when "anonymous"
            filtered.where(user_id: nil)
          else
            filtered
          end
        end

        def staff_intent_session_scope
          base = LeadIntentSession.all
          return base if current_user.platform_admin?

          brokerage_admin_ids = current_user.active_brokerage_admin_ids
          agent_ids = current_user.active_agent_ids
          return base.none if brokerage_admin_ids.empty? && agent_ids.empty?

          scoped_ids = []
          scoped_ids.concat(base.where(brokerage_id: brokerage_admin_ids).pluck(:id)) if brokerage_admin_ids.any?
          if agent_ids.any?
            scoped_ids.concat(base.where(requested_agent_id: agent_ids).pluck(:id))
            scoped_ids.concat(base.where(converted_lead_id: Lead.where(assigned_agent_id: agent_ids).select(:id)).pluck(:id))
          end

          base.where(id: scoped_ids.uniq)
        end

        def metrics_for(sessions)
          active_sessions = sessions.reject(&:converted?)
          {
            active_sessions: active_sessions.count,
            signed_in_sessions: active_sessions.count { |session| session.user_id.present? },
            high_intent_sessions: active_sessions.count { |session| high_intent?(session) },
            converted_sessions: sessions.count(&:converted?)
          }
        end

        def top_villages_for(sessions)
          counts = Hash.new(0)
          sessions.each do |session|
            Array(session.summary["top_villages"]).each do |village|
              name = village["name"].presence
              counts[name] += village["count"].to_i if name
            end
          end

          counts.sort_by { |_name, count| -count }.first(8).map { |name, count| { name: name, count: count } }
        end

        def high_intent?(session)
          summary = session.summary
          summary["unique_listing_view_count"].to_i >= 3 ||
            summary["saved_listing_count"].to_i.positive? ||
            summary["form_abandon_count"].to_i.positive? ||
            summary["agent_selected_count"].to_i.positive?
        end
      end
    end
  end
end
