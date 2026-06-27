module Api
  module V1
    module Admin
      class BrokeragesController < ApplicationController
        include ClerkAuthenticatable

        before_action :authenticate_user!
        before_action :require_staff!

        def index
          brokerages = brokerage_scope.order(:name)
          render json: { brokerages: brokerages.map { |brokerage| admin_brokerage_json(brokerage) } }
        end

        def update
          brokerage = brokerage_scope.find(params[:id])
          brokerage.settings = brokerage.settings.to_h.merge(prompt_settings_params.to_h.compact)

          if brokerage.save
            render json: { brokerage: admin_brokerage_json(brokerage) }
          else
            render json: { errors: brokerage.errors.full_messages }, status: :unprocessable_entity
          end
        rescue ActionController::BadRequest => e
          render json: { errors: [e.message] }, status: :unprocessable_entity
        end

        private

        def brokerage_scope
          return Brokerage.all if current_user.platform_admin?

          Brokerage.where(id: current_user.active_brokerage_admin_ids)
        end

        def prompt_settings_params
          permitted = params.require(:brokerage).permit(
            :lead_prompt_mode,
            :progressive_prompts_enabled,
            :listing_views_threshold,
            :prompt_snooze_hours
          )
          settings = {}

          if permitted.key?(:lead_prompt_mode)
            mode = permitted[:lead_prompt_mode].to_s
            unless %w[growth balanced selective].include?(mode)
              raise ActionController::BadRequest, "lead_prompt_mode is invalid"
            end
            settings["lead_prompt_mode"] = mode
          end

          if permitted.key?(:progressive_prompts_enabled)
            settings["progressive_prompts_enabled"] = ActiveModel::Type::Boolean.new.cast(permitted[:progressive_prompts_enabled])
          end

          if permitted.key?(:listing_views_threshold)
            settings["listing_views_threshold"] = positive_integer_setting(permitted[:listing_views_threshold], "listing_views_threshold", min: 1, max: 20)
          end

          if permitted.key?(:prompt_snooze_hours)
            settings["prompt_snooze_hours"] = positive_integer_setting(permitted[:prompt_snooze_hours], "prompt_snooze_hours", min: 1, max: 168)
          end

          settings
        end

        def positive_integer_setting(value, name, min:, max:)
          integer = value.to_i
          raise ActionController::BadRequest, "#{name} is invalid" unless integer.between?(min, max)

          integer
        end

        def admin_brokerage_json(brokerage)
          brokerage.as_api_json.merge(settings: brokerage.settings || {})
        end
      end
    end
  end
end
