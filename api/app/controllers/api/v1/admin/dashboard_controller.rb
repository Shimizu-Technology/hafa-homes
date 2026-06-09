module Api
  module V1
    module Admin
      class DashboardController < ApplicationController
        include ClerkAuthenticatable

        before_action :authenticate_user!
        before_action :require_staff!

        def show
          scoped_leads = lead_scope
          upcoming_showings = showing_scope.where(status: %w[proposed confirmed]).where("scheduled_starts_at IS NULL OR scheduled_starts_at >= ?", Time.current)
          stale_cutoff = 24.hours.ago

          render json: {
            metrics: {
              total_open_leads: scoped_leads.where(status: %w[new contacted showing_scheduled nurturing]).count,
              new_leads: scoped_leads.where(status: "new").count,
              unassigned_leads: scoped_leads.where(assigned_agent_id: nil).count,
              upcoming_showings: upcoming_showings.count,
              overdue_followups: scoped_leads.where(status: %w[new contacted]).where("last_contacted_at IS NULL OR last_contacted_at < ?", stale_cutoff).count
            },
            recent_leads: scoped_leads.order(created_at: :desc).limit(8).map { |lead| LeadSerializer.summary(lead) },
            upcoming_showing_appointments: upcoming_showings.includes(:lead, :listing, :brokerage, :agent, :created_by).order(Arel.sql("scheduled_starts_at ASC NULLS LAST"), created_at: :desc).limit(8).map { |showing| ShowingAppointmentSerializer.summary(showing) }
          }
        end

        private

        def lead_scope
          base = Lead.includes(:brokerage, :assigned_agent, { showing_appointments: [:listing, :brokerage, :agent, :created_by] }, listing: [:village, :brokerage, :agent])
          return base if current_user.platform_admin?

          brokerage_admin_ids = current_user.active_brokerage_admin_ids
          agent_ids = current_user.active_agent_ids
          return base.none if brokerage_admin_ids.empty? && agent_ids.empty?

          scoped = nil
          scoped = base.where(brokerage_id: brokerage_admin_ids) if brokerage_admin_ids.any?
          agent_scope = base.where(assigned_agent_id: agent_ids) if agent_ids.any?
          scoped = scoped ? scoped.or(agent_scope) : agent_scope if agent_scope
          scoped || base.none
        end

        def showing_scope
          ShowingAppointment.where(lead_id: lead_scope.select(:id))
        end
      end
    end
  end
end
