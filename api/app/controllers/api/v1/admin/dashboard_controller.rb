module Api
  module V1
    module Admin
      class DashboardController < ApplicationController
        include ClerkAuthenticatable
        include StaffLeadScoping

        before_action :authenticate_user!
        before_action :require_staff!

        def show
          scoped_leads = staff_lead_scope
          upcoming_showings = staff_showing_appointment_scope.where(status: %w[proposed confirmed]).where("scheduled_starts_at IS NULL OR scheduled_starts_at >= ?", Time.current)
          stale_cutoff = 24.hours.ago

          render json: {
            metrics: {
              total_open_leads: scoped_leads.where(status: %w[new contacted showing_scheduled nurturing]).count,
              new_leads: scoped_leads.where(status: "new").count,
              unassigned_leads: scoped_leads.where(assigned_agent_id: nil).count,
              upcoming_showings: upcoming_showings.count,
              overdue_followups: scoped_leads.where(status: %w[new contacted]).where("last_contacted_at IS NULL OR last_contacted_at < ?", stale_cutoff).count
            },
            recent_leads: scoped_leads.order(created_at: :desc).limit(8).map { |lead| LeadSerializer.staff_summary(lead) },
            upcoming_showing_appointments: upcoming_showings.includes(:lead, :listing, :brokerage, :agent, :created_by).order(Arel.sql("scheduled_starts_at ASC NULLS LAST"), created_at: :desc).limit(8).map { |showing| ShowingAppointmentSerializer.summary(showing) }
          }
        end

      end
    end
  end
end
