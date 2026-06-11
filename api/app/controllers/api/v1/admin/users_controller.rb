module Api
  module V1
    module Admin
      class UsersController < ApplicationController
        include ClerkAuthenticatable

        DEFAULT_LIMIT = 150
        MAX_LIMIT = 500
        USER_AUDIT_FIELDS = %w[role first_name last_name phone preferred_contact_method invitation_status archived_at archived_by_id].freeze

        before_action :authenticate_user!
        before_action :require_platform_admin!
        before_action :set_user, only: [:update]

        def index
          users = User.includes(:archived_by, :agent_profiles, brokerage_memberships: :brokerage).order(:role, :email).limit(requested_limit)
          render json: {
            users: users.map { |user| user.as_api_json.merge(agent_profiles: user.agent_profiles.map(&:as_api_json)) },
            brokerages: Brokerage.order(:name).map(&:as_api_json),
            agents: Agent.includes(:brokerage).order(:name).map(&:as_api_json)
          }
        end

        def create
          permitted = user_params
          user = User.new(base_user_attributes(permitted))
          user.clerk_id = "pending_#{SecureRandom.uuid}"
          user.invitation_status = "pending"
          user.invited_at = Time.current
          user.invited_by = current_user

          membership = build_brokerage_membership(user, permitted[:brokerage_membership]) if permitted[:brokerage_membership].present?

          User.transaction do
            user.save!
            membership&.save!
            apply_agent_profile(user, permitted[:agent_id]) if permitted.key?(:agent_id)
            maybe_create_agent_profile(user, permitted[:agent_profile], membership)
          end

          record_audit_event(
            action: "user_invited",
            target: user,
            metadata: { role: user.role, invitation_status: user.invitation_status }
          )

          render json: { user: serialize_user(user.reload) }, status: :created
        rescue ActiveRecord::RecordInvalid => e
          render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
        end

        def update
          permitted = user_params
          return if prevent_self_lockout(permitted) == false

          @user.assign_attributes(base_user_attributes(permitted).except(:email))
          membership = apply_brokerage_membership(@user, permitted[:brokerage_membership]) if permitted[:brokerage_membership].present?

          User.transaction do
            @user.save!
            membership&.save!
            apply_agent_profile(@user, permitted[:agent_id]) if permitted.key?(:agent_id)
            apply_archived_state(@user, permitted[:archived]) if permitted.key?(:archived)
          end

          changes = AuditLogger.change_details(@user.previous_changes, USER_AUDIT_FIELDS)
          record_audit_event(action: "user_updated", target: @user, changes: changes) if changes.any?

          render json: { user: serialize_user(@user.reload) }
        rescue ActiveRecord::RecordInvalid => e
          render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
        end

        private

        def set_user
          @user = User.find(params[:id])
        end

        def serialize_user(user)
          user.as_api_json.merge(agent_profiles: user.agent_profiles.includes(:brokerage).map(&:as_api_json))
        end

        def base_user_attributes(permitted)
          permitted.slice(:email, :role, :first_name, :last_name, :phone, :preferred_contact_method).tap do |attributes|
            attributes[:preferred_contact_method] = nil if attributes.key?(:preferred_contact_method) && attributes[:preferred_contact_method].blank?
            attributes[:phone] = nil if attributes.key?(:phone) && attributes[:phone].blank?
          end
        end

        def build_brokerage_membership(user, membership_params)
          brokerage_id = membership_params[:brokerage_id]
          return if brokerage_id.blank?

          brokerage = Brokerage.find_by(id: brokerage_id)
          unless brokerage
            user.errors.add(:base, "Brokerage #{brokerage_id} not found")
            raise ActiveRecord::RecordInvalid, user
          end

          user.brokerage_memberships.build(
            brokerage: brokerage,
            role: membership_params[:role].presence || membership_role_for(user.role),
            status: membership_params[:status].presence || "invited"
          )
        end

        def apply_brokerage_membership(user, membership_params)
          brokerage_id = membership_params[:brokerage_id]
          return if brokerage_id.blank?

          brokerage = Brokerage.find_by(id: brokerage_id)
          unless brokerage
            user.errors.add(:base, "Brokerage #{brokerage_id} not found")
            raise ActiveRecord::RecordInvalid, user
          end

          membership = user.brokerage_memberships.find_or_initialize_by(brokerage: brokerage)
          membership.role = membership_params[:role].presence || membership_role_for(user.role)
          membership.status = membership_params[:status].presence || "active"
          membership
        end

        def membership_role_for(product_role)
          product_role == "brokerage_admin" ? "brokerage_admin" : "agent"
        end

        def apply_agent_profile(user, agent_id)
          user.agent_profiles.update_all(user_id: nil)
          return if agent_id.blank?

          agent = Agent.find_by(id: agent_id)
          unless agent
            user.errors.add(:base, "Agent #{agent_id} not found")
            raise ActiveRecord::RecordInvalid, user
          end

          agent.user = user
          agent.save!
        end

        def maybe_create_agent_profile(user, agent_profile_params, membership)
          return unless ActiveModel::Type::Boolean.new.cast(agent_profile_params&.fetch(:create, false))

          brokerage_id = agent_profile_params[:brokerage_id].presence || membership&.brokerage_id
          brokerage = Brokerage.find_by(id: brokerage_id)
          unless brokerage
            user.errors.add(:base, "Brokerage is required to create an agent profile")
            raise ActiveRecord::RecordInvalid, user
          end

          agent = Agent.create!(
            brokerage: brokerage,
            user: user,
            name: agent_profile_params[:name].presence || user.full_name,
            email: agent_profile_params[:email].presence || user.email,
            phone: agent_profile_params[:phone].presence || user.phone,
            license_number: agent_profile_params[:license_number].presence,
            status: "active"
          )
          record_audit_event(action: "agent_profile_created", target: agent, brokerage: brokerage, metadata: { user_id: user.id })
        end

        def apply_archived_state(user, archived)
          should_archive = ActiveModel::Type::Boolean.new.cast(archived)
          if should_archive && !user.archived?
            user.archive!(actor: current_user)
            record_audit_event(action: "user_archived", target: user)
          elsif !should_archive && user.archived?
            user.reactivate!
            record_audit_event(action: "user_reactivated", target: user)
          end
        end

        def prevent_self_lockout(permitted)
          return true unless @user.id == current_user.id

          if ActiveModel::Type::Boolean.new.cast(permitted[:archived])
            render json: { errors: ["You cannot archive your own account"] }, status: :unprocessable_entity
            return false
          end

          if permitted[:role].present? && permitted[:role] != "platform_admin"
            render json: { errors: ["You cannot remove your own platform admin role"] }, status: :unprocessable_entity
            return false
          end

          true
        end

        def requested_limit
          params.fetch(:limit, DEFAULT_LIMIT).to_i.clamp(1, MAX_LIMIT)
        end

        def user_params
          params.require(:user).permit(
            :email,
            :role,
            :first_name,
            :last_name,
            :phone,
            :preferred_contact_method,
            :archived,
            :agent_id,
            brokerage_membership: [:brokerage_id, :role, :status],
            agent_profile: [:create, :brokerage_id, :name, :email, :phone, :license_number]
          )
        end
      end
    end
  end
end
