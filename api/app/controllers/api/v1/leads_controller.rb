module Api
  module V1
    class LeadsController < ApplicationController
      def index
        leads = Lead.includes(:listing).order(created_at: :desc).limit(100)

        render json: {
          leads: leads.map do |lead|
            lead.as_json(
              only: [
                :id,
                :lead_type,
                :name,
                :email,
                :phone,
                :preferred_contact_method,
                :message,
                :status,
                :listing_id,
                :created_at
              ]
            ).merge(
              listing: lead.listing ? {
                id: lead.listing.id,
                title: lead.listing.title,
                price: lead.listing.price.to_f,
                listing_kind: lead.listing.listing_kind,
                village: lead.listing.village.name
              } : nil
            )
          end
        }
      end

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
