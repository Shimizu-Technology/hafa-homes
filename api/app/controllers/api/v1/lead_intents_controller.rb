module Api
  module V1
    class LeadIntentsController < ApplicationController
      include ClerkAuthenticatable

      before_action :authenticate_user_optional

      def events
        permitted = event_params
        brokerage = current_routing_brokerage
        unless brokerage
          render json: { errors: ["No active brokerage is available for lead intent tracking"] }, status: :unprocessable_entity
          return
        end

        session = LeadIntentSession.find_or_create_for_token!(permitted[:session_token], user: current_user, brokerage: brokerage)
        listing = listing_from_params(permitted[:listing_id])
        village = village_from_params(permitted[:village_id], listing)
        agent = agent_from_params(permitted[:agent_id], brokerage)
        return if performed?

        event = session.record_event!(
          event_name: permitted[:event_name],
          client_event_id: permitted[:client_event_id].to_s.truncate(120).presence,
          user: current_user,
          brokerage: brokerage,
          listing: listing,
          village: village,
          agent: agent,
          source: permitted[:source].to_s.truncate(40).presence,
          metadata: sanitized_metadata(permitted[:metadata]),
          occurred_at: Time.current
        )

        render json: {
          lead_intent_session: Api::V1::LeadIntentSessionSerializer.summary(session.reload),
          lead_intent_event: { id: event.id, event_name: event.event_name, occurred_at: event.occurred_at },
          prompt: session.prompt_payload(latest_event: event)
        }, status: :created
      rescue ActionController::ParameterMissing, ArgumentError => e
        render json: { errors: [e.message] }, status: :unprocessable_entity
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def dismiss
        permitted = dismiss_params
        session = LeadIntentSession.find_by_token(permitted[:session_token])
        unless session
          render json: { errors: ["Lead intent session not found"] }, status: :not_found
          return
        end

        session.dismiss!(prompt_key: permitted[:prompt_key], reason: permitted[:reason])
        render json: {
          lead_intent_session: Api::V1::LeadIntentSessionSerializer.summary(session),
          prompt: { eligible: false, reason: "snoozed", summary: session.public_summary }
        }
      rescue ActionController::ParameterMissing, ArgumentError => e
        render json: { errors: [e.message] }, status: :unprocessable_entity
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      private

      def event_params
        params.require(:lead_intent_event).permit(
          :session_token,
          :event_name,
          :client_event_id,
          :source,
          :listing_id,
          :village_id,
          :agent_id,
          metadata: {}
        )
      end

      def dismiss_params
        params.require(:lead_intent).permit(:session_token, :prompt_key, :reason)
      end

      def listing_from_params(listing_id)
        return nil if listing_id.blank?

        Listing.active.includes(:village).find_by(id: listing_id).tap do |listing|
          render json: { errors: ["Listing not found"] }, status: :unprocessable_entity unless listing
        end
      end

      def village_from_params(village_id, listing)
        return listing&.village if listing
        return nil if village_id.blank?

        Village.find_by(id: village_id)
      end

      def agent_from_params(agent_id, brokerage)
        return nil if agent_id.blank?

        agent = Agent.active.find_by(id: agent_id)
        unless agent&.brokerage_id == brokerage.id
          render json: { errors: ["Agent is not available for this brokerage"] }, status: :unprocessable_entity
          return nil
        end

        agent
      end

      def sanitized_metadata(raw_metadata)
        raw_metadata ||= {}
        allowed_keys = %w[
          surface
          source
          listing_kind
          filter
          value
          query
          view_mode
          trigger
          path
          prompt_key
          selected
        ]
        raw_hash = raw_metadata.respond_to?(:to_unsafe_h) ? raw_metadata.to_unsafe_h : raw_metadata.to_h
        raw_hash.slice(*allowed_keys).transform_values do |value|
          case value
          when String
            value.truncate(180)
          when Numeric, TrueClass, FalseClass
            value
          else
            value.to_s.truncate(180)
          end
        end
      end
    end
  end
end
