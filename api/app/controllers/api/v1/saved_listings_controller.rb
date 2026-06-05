module Api
  module V1
    class SavedListingsController < ApplicationController
      include ClerkAuthenticatable

      before_action :authenticate_user!

      def index
        records = current_user.saved_listing_records
          .includes(listing: [:village, :listing_photos, :features])
          .order(created_at: :desc)

        render json: {
          listing_ids: records.map(&:listing_id),
          listings: records.map { |record| ListingSerializer.summary(record.listing).merge(saved_at: record.created_at) }
        }
      end

      def create
        listing = Listing.active.find(listing_id_param)
        record = save_record_for(listing)

        render json: {
          saved: true,
          listing_id: listing.id,
          listing: ListingSerializer.summary(record.listing).merge(saved_at: record.created_at)
        }, status: :created
      end

      def destroy
        current_user.saved_listing_records.find_by(listing_id: listing_id_param)&.destroy

        render json: {
          saved: false,
          listing_id: listing_id_param.to_i
        }
      end

      private

      def listing_id_param
        params[:listing_id] || params[:id]
      end

      def save_record_for(listing)
        current_user.saved_listing_records.find_or_create_by!(listing: listing)
      rescue ActiveRecord::RecordNotUnique
        current_user.saved_listing_records.find_by!(listing: listing)
      end
    end
  end
end
