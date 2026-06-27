module Api
  module V1
    class SearchProfilesController < ApplicationController
      include ClerkAuthenticatable

      before_action :authenticate_user!

      def show
        render json: { search_profile: serialize_profile(current_profile) }
      end

      def update
        profile = current_profile
        profile.assign_attributes(search_profile_params)

        if profile.save
          changes = AuditLogger.change_details(
            profile.previous_changes,
            %w[
              preferred_contact_method phone prequalified_status lender_name purchase_timeline budget_min budget_max
              desired_villages desired_beds desired_baths buyer_status already_working_with_agent notes completed_at
            ]
          )
          record_audit_event(action: "search_profile_updated", target: profile, brokerage: profile.brokerage, changes: changes) if changes.any?
          render json: { search_profile: serialize_profile(profile) }
        else
          render json: { errors: profile.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def current_profile
        current_user.buyer_search_profile || current_user.build_buyer_search_profile(
          brokerage: current_routing_brokerage,
          phone: current_user.phone,
          preferred_contact_method: current_user.preferred_contact_method
        )
      end

      def serialize_profile(profile)
        Api::V1::BuyerSearchProfileSerializer.summary(profile, user: current_user)
      end

      def search_profile_params
        params.require(:search_profile).permit(
          :preferred_contact_method,
          :phone,
          :prequalified_status,
          :lender_name,
          :purchase_timeline,
          :budget_min,
          :budget_max,
          :desired_villages,
          :desired_beds,
          :desired_baths,
          :buyer_status,
          :already_working_with_agent,
          :notes
        ).tap do |permitted|
          %i[
            preferred_contact_method phone prequalified_status lender_name purchase_timeline budget_min budget_max
            desired_villages desired_beds desired_baths buyer_status already_working_with_agent notes
          ].each do |key|
            permitted[key] = nil if permitted.key?(key) && permitted[key].blank?
          end
        end
      end
    end
  end
end
