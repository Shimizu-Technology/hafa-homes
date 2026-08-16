module Api
  module V1
    class ListingsController < ApplicationController
      def index
        listings = Listing.includes(:village, :listing_photos, :features, :brokerage, :agent).active
        listings = listings.for_kind(params[:kind])
        listings = listings.in_village(params[:village])
        listings = listings.property_type(params[:property_type])
        listings = listings.min_price(params[:min_price])
        listings = listings.max_price(params[:max_price])
        listings = listings.min_beds(params[:beds])
        listings = listings.min_baths(params[:baths])
        listings = listings.matching(params[:q])
        listings = filter_by_features(listings)

        render json: {
          listings: listings.order(published_at: :desc).map { |listing| ListingSerializer.summary(listing) }
        }
      end

      def show
        listing = Listing.includes(:village, :listing_photos, :features, :brokerage, :agent).find(params[:id])
        render json: { listing: ListingSerializer.detail(listing) }
      end

      private

      def filter_by_features(listings)
        slugs = Array(params[:features]).flat_map { |value| value.to_s.split(",") }.reject(&:blank?)
        return listings if slugs.empty?

        listings.joins(:features).where(features: { slug: slugs }).distinct
      end

    end
  end
end
