module Api
  module V1
    class LeadActivitiesController < ApplicationController
      include ClerkAuthenticatable
      include StaffLeadScoping
      include PaginatedResponse

      before_action :authenticate_user!
      before_action :require_staff!

      def index
        lead = staff_lead_scope.find(params[:lead_id])
        activities = lead.lead_activities.includes(:actor).recent_first
        response = paginated_response(activities, :lead_activities) { |activity| Api::V1::LeadActivitySerializer.summary(activity) }
        render json: response
      end
    end
  end
end
