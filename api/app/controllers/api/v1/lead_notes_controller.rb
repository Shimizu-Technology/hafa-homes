module Api
  module V1
    class LeadNotesController < ApplicationController
      include ClerkAuthenticatable
      include StaffLeadScoping

      before_action :authenticate_user!
      before_action :require_staff!

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

      private

      def note_params
        params.require(:lead_note).permit(:body)
      end
    end
  end
end
