module Api
  module V1
    class ShowingAppointmentsController < ApplicationController
      include ClerkAuthenticatable
      include StaffLeadScoping
      include PaginatedResponse

      before_action :authenticate_user!
      before_action :require_staff!
      before_action :set_showing_appointment, only: [:show, :update]

      def index
        showings = staff_showing_appointment_scope
          .includes(:brokerage, :agent, :created_by, listing: [:village, :listing_photos])
          .order(Arel.sql("scheduled_starts_at DESC NULLS LAST"), created_at: :desc)

        response = paginated_response(showings, :showing_appointments, default_per_page: 100, max_per_page: 100) do |showing|
          ShowingAppointmentSerializer.summary(showing)
        end
        render json: response
      end

      def show
        render json: { showing_appointment: ShowingAppointmentSerializer.detail(@showing_appointment) }
      end

      def create
        lead = staff_lead_scope.find(showing_params[:lead_id])
        showing = lead.showing_appointments.build(showing_params.except(:lead_id, :agent_id))
        showing.created_by = current_user
        showing.activity_actor = current_user
        return if apply_agent(showing, showing_params[:agent_id]) == false

        if showing.save
          record_audit_event(action: "showing_created", target: showing, lead: lead, metadata: { status: showing.status, tour_type: showing.tour_type })
          render json: { showing_appointment: ShowingAppointmentSerializer.summary(showing), lead: LeadSerializer.detail(lead.reload) }, status: :created
        else
          render json: { errors: showing.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def update
        @showing_appointment.assign_attributes(showing_params.except(:lead_id, :agent_id))
        @showing_appointment.activity_actor = current_user
        return if apply_agent(@showing_appointment, showing_params[:agent_id]) == false

        if @showing_appointment.save
          changes = AuditLogger.change_details(@showing_appointment.previous_changes, %w[status scheduled_starts_at scheduled_ends_at location agent_id consumer_notes internal_notes])
          record_audit_event(action: "showing_updated", target: @showing_appointment, lead: @showing_appointment.lead, changes: changes) if changes.any?
          render json: { showing_appointment: ShowingAppointmentSerializer.summary(@showing_appointment), lead: LeadSerializer.detail(@showing_appointment.lead.reload) }
        else
          render json: { errors: @showing_appointment.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def set_showing_appointment
        @showing_appointment = staff_showing_appointment_scope
          .includes(:lead, :brokerage, :agent, :created_by, listing: [:village, :listing_photos])
          .find(params[:id])
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
