module Api
  module V1
    class LeadActivitiesController < ApplicationController
      include ClerkAuthenticatable
      include StaffLeadScoping

      before_action :authenticate_user!
      before_action :require_staff!

      def index
        lead = staff_lead_scope.find(params[:lead_id])
        activities = lead.lead_activities.includes(:actor).recent_first
        response = paginated_response(activities, :lead_activities) { |activity| Api::V1::LeadActivitySerializer.summary(activity) }
        render json: response
      end

      private

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
