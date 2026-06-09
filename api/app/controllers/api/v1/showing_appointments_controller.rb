module Api
  module V1
    class ShowingAppointmentsController < ApplicationController
      include ClerkAuthenticatable

      before_action :authenticate_user!
      before_action :require_staff!
      before_action :set_showing_appointment, only: [:show, :update]

      def index
        showings = showing_appointment_scope
          .includes(:lead, :listing, :brokerage, :agent, :created_by)
          .upcoming
          .limit(100)

        render json: { showing_appointments: showings.map { |showing| ShowingAppointmentSerializer.summary(showing) } }
      end

      def show
        render json: { showing_appointment: ShowingAppointmentSerializer.summary(@showing_appointment) }
      end

      def create
        lead = lead_scope.find(showing_params[:lead_id])
        showing = lead.showing_appointments.build(showing_params.except(:lead_id, :agent_id))
        showing.created_by = current_user
        return if apply_agent(showing, showing_params[:agent_id]) == false

        if showing.save
          sync_lead_from_showing!(lead, showing)
          render json: { showing_appointment: ShowingAppointmentSerializer.summary(showing), lead: LeadSerializer.detail(lead.reload) }, status: :created
        else
          render json: { errors: showing.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def update
        @showing_appointment.assign_attributes(showing_params.except(:lead_id, :agent_id))
        return if apply_agent(@showing_appointment, showing_params[:agent_id]) == false

        if @showing_appointment.save
          sync_lead_from_showing!(@showing_appointment.lead, @showing_appointment)
          render json: { showing_appointment: ShowingAppointmentSerializer.summary(@showing_appointment), lead: LeadSerializer.detail(@showing_appointment.lead.reload) }
        else
          render json: { errors: @showing_appointment.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def set_showing_appointment
        @showing_appointment = showing_appointment_scope.find(params[:id])
      end

      def showing_appointment_scope
        ShowingAppointment.where(lead_id: lead_scope.select(:id))
      end

      def lead_scope
        base = Lead.includes(:brokerage, :assigned_agent, listing: [:village, :brokerage, :agent])
        return base if current_user.platform_admin?

        brokerage_admin_ids = authorized_brokerage_admin_ids
        agent_ids = authorized_agent_ids
        return base.none if brokerage_admin_ids.empty? && agent_ids.empty?

        scoped = nil
        scoped = base.where(brokerage_id: brokerage_admin_ids) if brokerage_admin_ids.any?
        agent_scope = base.where(assigned_agent_id: agent_ids) if agent_ids.any?
        scoped = scoped ? scoped.or(agent_scope) : agent_scope if agent_scope
        scoped || base.none
      end

      def assignable_agents_for(lead)
        agents = assignable_agents_for_scope
        brokerage_id = lead.brokerage_id || lead.assigned_agent&.brokerage_id
        return agents if brokerage_id.blank?

        agents.where(brokerage_id: brokerage_id)
      end

      def assignable_agents_for_scope
        return Agent.includes(:brokerage).active.order(:name) if current_user.platform_admin?

        brokerage_admin_ids = authorized_brokerage_admin_ids
        return Agent.includes(:brokerage).active.where(brokerage_id: brokerage_admin_ids).order(:name) if brokerage_admin_ids.any?

        Agent.includes(:brokerage).active.where(id: authorized_agent_ids).order(:name)
      end

      def apply_agent(showing, agent_id)
        return true unless showing_params.key?(:agent_id)

        if agent_id.present?
          agent = assignable_agents_for(showing.lead).find_by(id: agent_id)
          unless agent
            render json: { errors: ["Agent is not available for this showing"] }, status: :unprocessable_entity
            return false
          end

          showing.agent = agent
          showing.brokerage ||= agent.brokerage
          showing.lead.assigned_agent ||= agent
          showing.lead.brokerage ||= agent.brokerage
        else
          showing.skip_agent_inference = true
          showing.agent = nil
        end

        true
      end

      def sync_lead_from_showing!(lead, showing)
        updates = {}
        updates[:assigned_agent] = showing.agent if showing.agent && lead.assigned_agent_id != showing.agent_id
        updates[:brokerage] = showing.brokerage if showing.brokerage && lead.brokerage_id != showing.brokerage_id
        if %w[proposed confirmed].include?(showing.status) && showing.scheduled_starts_at.present?
          updates[:status] = "showing_scheduled"
          updates[:last_contacted_at] = Time.current
        end

        lead.update!(updates) if updates.any?
      end

      def authorized_brokerage_admin_ids
        @authorized_brokerage_admin_ids ||= current_user.active_brokerage_admin_ids
      end

      def authorized_agent_ids
        @authorized_agent_ids ||= current_user.active_agent_ids
      end

      def showing_params
        params.require(:showing_appointment).permit(
          :lead_id,
          :agent_id,
          :scheduled_starts_at,
          :scheduled_ends_at,
          :timezone,
          :tour_type,
          :status,
          :location,
          :consumer_notes,
          :internal_notes
        )
      end
    end
  end
end
