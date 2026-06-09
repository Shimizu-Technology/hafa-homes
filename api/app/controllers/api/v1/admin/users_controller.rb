module Api
  module V1
    module Admin
      class UsersController < ApplicationController
        include ClerkAuthenticatable

        DEFAULT_LIMIT = 100
        MAX_LIMIT = 500

        before_action :authenticate_user!
        before_action :require_platform_admin!
        before_action :set_user, only: [:update]

        def index
          users = User.includes(:agent_profiles, brokerage_memberships: :brokerage).order(:role, :email).limit(requested_limit)
          render json: {
            users: users.map { |user| user.as_api_json.merge(agent_profiles: user.agent_profiles.map(&:as_api_json)) },
            brokerages: Brokerage.order(:name).map(&:as_api_json),
            agents: Agent.includes(:brokerage).order(:name).map(&:as_api_json)
          }
        end

        def update
          permitted = user_params
          @user.assign_attributes(permitted.slice(:role, :first_name, :last_name))
          membership = apply_brokerage_membership(permitted[:brokerage_membership]) if permitted[:brokerage_membership].present?

          User.transaction do
            @user.save!
            membership&.save!
            apply_agent_profile(permitted[:agent_id]) if permitted.key?(:agent_id)
          end

          render json: { user: @user.reload.as_api_json.merge(agent_profiles: @user.agent_profiles.includes(:brokerage).map(&:as_api_json)) }
        rescue ActiveRecord::RecordInvalid => e
          render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
        end

        private

        def set_user
          @user = User.find(params[:id])
        end

        def apply_brokerage_membership(membership_params)
          brokerage_id = membership_params[:brokerage_id]
          return if brokerage_id.blank?

          membership = @user.brokerage_memberships.find_or_initialize_by(brokerage_id: brokerage_id)
          membership.role = membership_params[:role] if membership_params[:role].present?
          membership.status = membership_params[:status] if membership_params[:status].present?
          membership
        end

        def apply_agent_profile(agent_id)
          @user.agent_profiles.update_all(user_id: nil)
          return if agent_id.blank?

          agent = Agent.find(agent_id)
          agent.user = @user
          agent.save!
        end

        def requested_limit
          params.fetch(:limit, DEFAULT_LIMIT).to_i.clamp(1, MAX_LIMIT)
        end

        def user_params
          params.require(:user).permit(
            :role,
            :first_name,
            :last_name,
            :agent_id,
            brokerage_membership: [:brokerage_id, :role, :status]
          )
        end
      end
    end
  end
end
