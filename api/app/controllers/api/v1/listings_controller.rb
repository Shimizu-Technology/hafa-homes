module Api
  module V1
    class ListingsController < ApplicationController
      def index
        listings = Listing.includes(:village, :listing_photos, :features).active
        listings = listings.for_kind(params[:kind])
        listings = listings.in_village(params[:village])
        listings = listings.property_type(params[:property_type])
        listings = listings.min_price(params[:min_price])
        listings = listings.max_price(params[:max_price])
        listings = listings.min_beds(params[:beds])
        listings = listings.min_baths(params[:baths])
        listings = filter_by_features(listings)

        render json: {
          listings: listings.order(published_at: :desc).map { |listing| listing_summary(listing) }
        }
      end

      def show
        listing = Listing.includes(:village, :listing_photos, :features).find(params[:id])
        render json: { listing: listing_detail(listing) }
      end

      private

      def filter_by_features(listings)
        slugs = Array(params[:features]).flat_map { |value| value.to_s.split(",") }.reject(&:blank?)
        return listings if slugs.empty?

        listings.joins(:features).where(features: { slug: slugs }).distinct
      end

      def listing_summary(listing)
        {
          id: listing.id,
          title: listing.title,
          status: listing.status,
          listing_kind: listing.listing_kind,
          property_type: listing.property_type,
          price: listing.price.to_f,
          address: listing.address,
          village: village_json(listing.village),
          beds: listing.beds,
          baths: listing.baths&.to_f,
          square_feet: listing.square_feet,
          latitude: listing.latitude&.to_f,
          longitude: listing.longitude&.to_f,
          primary_photo_url: listing.primary_photo_url,
          features: listing.features.map { |feature| feature_json(feature) }
        }
      end

      def listing_detail(listing)
        listing_summary(listing).merge(
          village: village_json(listing.village, include_local_intel: true),
          external_id: listing.external_id,
          source: listing.source,
          lot_square_feet: listing.lot_square_feet,
          year_built: listing.year_built,
          description: listing.description,
          agent_name: listing.agent_name,
          brokerage_name: listing.brokerage_name,
          published_at: listing.published_at,
          source_updated_at: listing.source_updated_at,
          photos: listing.listing_photos.map do |photo|
            { id: photo.id, url: photo.url, position: photo.position, alt_text: photo.alt_text }
          end
        )
      end

      def village_json(village, include_local_intel: false)
        return nil unless village

        payload = {
          id: village.id,
          name: village.name,
          slug: village.slug,
          region: village.region
        }
        payload[:local_intel] = village.local_intel || {} if include_local_intel
        payload
      end

      def feature_json(feature)
        { id: feature.id, name: feature.name, slug: feature.slug, category: feature.category }
      end
    end
  end
end
