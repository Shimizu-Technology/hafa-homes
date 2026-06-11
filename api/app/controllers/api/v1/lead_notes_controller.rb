module Api
  module V1
    class LeadNotesController < ApplicationController
      include ClerkAuthenticatable
      include StaffLeadScoping
      include PaginatedResponse

      before_action :authenticate_user!
      before_action :require_staff!

      def index
        lead = staff_lead_scope.find(params[:lead_id])
        notes = lead.lead_notes.includes(:author, :archived_by)
        notes = notes.active unless include_archived?
        notes = notes.recent_first
        response = paginated_response(notes, :lead_notes) { |note| Api::V1::LeadNoteSerializer.summary(note) }
        render json: response
      end

      def create
        lead = staff_lead_scope.find(params[:lead_id])
        note = lead.lead_notes.build(note_params)
        note.author = current_user

        if note.save
          record_audit_event(action: "lead_note_created", target: note, lead: lead)
          render json: { lead_note: Api::V1::LeadNoteSerializer.summary(note), lead: LeadSerializer.detail(lead.reload) }, status: :created
        else
          render json: { errors: note.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def update
        note = LeadNote.where(lead_id: staff_lead_scope.select(:id)).find(params[:id])
        note.activity_actor = current_user
        apply_note_update(note)

        if note.save
          changes = AuditLogger.change_details(note.previous_changes, %w[body archived_at archived_by_id])
          record_audit_event(action: note.archived? ? "lead_note_archived" : "lead_note_updated", target: note, lead: note.lead, changes: changes) if changes.any?
          render json: { lead_note: Api::V1::LeadNoteSerializer.summary(note), lead: LeadSerializer.detail(note.lead.reload) }
        else
          render json: { errors: note.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def note_params
        params.require(:lead_note).permit(:body)
      end

      def include_archived?
        ActiveModel::Type::Boolean.new.cast(params[:include_archived])
      end

      def note_update_params
        params.require(:lead_note).permit(:body, :archived)
      end

      def apply_note_update(note)
        permitted = note_update_params
        note.body = permitted[:body] if permitted.key?(:body)
        return unless permitted.key?(:archived)

        archived = ActiveModel::Type::Boolean.new.cast(permitted[:archived])
        if archived
          note.archived_at ||= Time.current
          note.archived_by = current_user
        else
          note.archived_at = nil
          note.archived_by = nil
        end
      end
    end
  end
end
