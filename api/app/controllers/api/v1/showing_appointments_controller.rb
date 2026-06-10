module Api
  module V1
    class ShowingAppointmentsController < ApplicationController
      include ClerkAuthenticatable
      include StaffLeadScoping

      before_action :authenticate_user!
      before_action :require_staff!
      before_action :set_showing_appointment, only: [:show, :update]

      def index
        showings = staff_showing_appointment_scope
          .includes(:lead, :listing, :brokerage, :agent, :created_by)
          .order(Arel.sql("scheduled_starts_at DESC NULLS LAST"), created_at: :desc)
          .limit(100)

        render json: { showing_appointments: showings.map { |showing| ShowingAppointmentSerializer.summary(showing) } }
      end

      def show
        render json: { showing_appointment: ShowingAppointmentSerializer.summary(@showing_appointment) }
      end

      def create
        lead = staff_lead_scope.find(showing_params[:lead_id])
        showing = lead.showing_appointments.build(showing_params.except(:lead_id, :agent_id))
        showing.created_by = current_user
        return if apply_agent(showing, showing_params[:agent_id]) == false

        if showing.save
          render json: { showing_appointment: ShowingAppointmentSerializer.summary(showing), lead: LeadSerializer.detail(lead.reload) }, status: :created
        else
          render json: { errors: showing.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def update
        @showing_appointment.assign_attributes(showing_params.except(:lead_id, :agent_id))
        return if apply_agent(@showing_appointment, showing_params[:agent_id]) == false

        if @showing_appointment.save
          render json: { showing_appointment: ShowingAppointmentSerializer.summary(@showing_appointment), lead: LeadSerializer.detail(@showing_appointment.lead.reload) }
        else
          render json: { errors: @showing_appointment.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def set_showing_appointment
        @showing_appointment = staff_showing_appointment_scope.find(params[:id])
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
        else
          showing.skip_agent_inference = true
          showing.agent = nil
        end

        true
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
