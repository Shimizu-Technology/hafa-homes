module Api
  module V1
    module Admin
      class CustomerWorkspacesController < ApplicationController
        include ClerkAuthenticatable
        include StaffLeadScoping
        include PaginatedResponse

        before_action :authenticate_user!
        before_action :require_staff!

        def show
          identity = authorized_requests.pick(:user_id, :brokerage_id)
          raise ActiveRecord::RecordNotFound unless identity

          customer = User.find(identity.first)
          brokerage = Brokerage.find(identity.second)
          requests = authorized_requests.order(created_at: :desc)
          response = paginated_response(requests, :requests, default_per_page: 10, max_per_page: 50) do |lead|
            LeadSerializer.staff_summary(lead)
          end

          render json: response.merge(
            customer: customer_json(customer),
            brokerage: brokerage_json(brokerage),
            search_profile: search_profile_json(customer, brokerage),
            metrics: customer_metrics(requests)
          )
        end

        private

        def authorized_requests
          @authorized_requests ||= staff_lead_scope.where(
            brokerage_id: params[:brokerage_id],
            user_id: params[:user_id]
          )
        end

        def customer_json(customer)
          {
            id: customer.id,
            full_name: customer.full_name,
            email: customer.email,
            phone: customer.phone,
            preferred_contact_method: customer.preferred_contact_method,
            account_created_at: customer.created_at
          }
        end

        def brokerage_json(brokerage)
          {
            id: brokerage.id,
            name: brokerage.name,
            slug: brokerage.slug,
            app_display_name: brokerage.app_display_name
          }
        end

        def search_profile_json(customer, brokerage)
          profile = customer.buyer_search_profiles.find_by(brokerage: brokerage)
          return nil unless profile

          BuyerSearchProfileSerializer.summary(profile, user: customer)
        end

        def customer_metrics(requests)
          open_statuses = %w[new contacted showing_scheduled nurturing]
          metric_requests = requests.except(:includes, :preload, :eager_load, :order)
          {
            total_requests: metric_requests.count,
            open_requests: metric_requests.where(status: open_statuses).count,
            upcoming_showings: ShowingAppointment
              .where(lead_id: metric_requests.select(:id), status: %w[proposed confirmed])
              .where("scheduled_starts_at >= ?", Time.current)
              .count,
            last_request_at: metric_requests.maximum(:created_at)
          }
        end
      end
    end
  end
end
