module Api
  module V1
    class LeadsController < ApplicationController
      def create
        lead = Lead.new(lead_params)

        if lead.save
          render json: { lead: lead.as_json(only: [:id, :lead_type, :name, :email, :phone, :status, :listing_id]) }, status: :created
        else
          render json: { errors: lead.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def lead_params
        params.require(:lead).permit(
          :lead_type,
          :name,
          :email,
          :phone,
          :preferred_contact_method,
          :message,
          :listing_id
        )
      end
    end
  end
end
