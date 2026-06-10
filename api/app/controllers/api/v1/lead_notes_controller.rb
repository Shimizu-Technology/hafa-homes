module Api
  module V1
    class LeadNotesController < ApplicationController
      include ClerkAuthenticatable
      include StaffLeadScoping

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

      def paginated_response(scope, collection_key)
        page = [params.fetch(:page, 1).to_i, 1].max
        per_page = [[params.fetch(:per_page, 10).to_i, 1].max, 50].min
        total_count = scope.count
        records = scope.offset((page - 1) * per_page).limit(per_page)

        {
          collection_key => records.map { |record| yield(record) },
          pagination: {
            page: page,
            per_page: per_page,
            total_count: total_count,
            total_pages: (total_count.to_f / per_page).ceil
          }
        }
      end
    end
  end
end
