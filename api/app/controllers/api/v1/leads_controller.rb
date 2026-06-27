module Api
  module V1
    class LeadsController < ApplicationController
      include ClerkAuthenticatable
      include StaffLeadScoping

      before_action :authenticate_user!, only: [:index, :show, :update, :send_notification]
      before_action :require_staff!, only: [:index, :show, :update, :send_notification]
      before_action :authenticate_user_optional, only: [:create]
      before_action :set_lead, only: [:show, :update, :send_notification]

      def index
        leads = filtered_staff_leads
        return if performed?

        leads = leads.order(created_at: :desc).limit(100)

        render json: {
          leads: leads.map { |lead| LeadSerializer.staff_summary(lead) },
          assignable_agents: assignable_agents_for_scope.map(&:as_api_json)
        }
      end

      def show
        render json: {
          lead: LeadSerializer.detail(@lead),
          assignable_agents: assignable_agents_for(@lead).map(&:as_api_json)
        }
      end

      def create
        permitted = lead_params
        normalize_blank_lead_values(permitted)
        intent_session = lead_intent_session_from_token(permitted.delete(:intent_session_token))
        lead = Lead.new(permitted.except(:listing_id, :requested_agent_id))
        lead.listing = active_listing_from_params(permitted)
        return if performed?

        assign_routing_brokerage(lead)
        return if performed?

        assign_requested_agent_from_params(lead, permitted[:requested_agent_id])
        return if performed?

        lead.user = current_user if current_user
        lead.lead_intent_session = intent_session if intent_session
        lead.queue_request_received_notification = true

        if lead.save
          record_submission_context_for_empty_intent_session(lead, intent_session)
          mark_intent_session_converted(lead, intent_session)
          record_audit_event(action: "lead_created", target: lead, lead: lead, metadata: { lead_type: lead.lead_type, source: lead.lead_source, lead_intent_session_id: intent_session&.id })
          render json: { lead: serialized_created_lead(lead) }, status: :created
        else
          render json: { errors: lead.errors.full_messages }, status: :unprocessable_entity
        end
      rescue LeadIntentSession::ScopeMismatchError => e
        render_intent_session_scope_mismatch(e)
      end

      def update
        return if apply_lead_update_params == false

        if @lead.save
          record_lead_update_activity
          record_global_lead_update_audit
          render json: {
            lead: LeadSerializer.detail(@lead),
            assignable_agents: assignable_agents_for(@lead).map(&:as_api_json)
          }
        else
          render json: { errors: @lead.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def send_notification
        permitted = notification_params
        unless NotificationDelivery::CHANNELS.include?(permitted[:channel]) && NotificationDelivery::RECIPIENT_ROLES.include?(permitted[:recipient_role])
          return render json: { errors: ["Notification recipient or channel is invalid"] }, status: :unprocessable_entity
        end

        if permitted[:event_name].blank? || permitted[:event_name] == "manual_update"
          if permitted[:body].blank?
            return render json: { errors: ["Message body is required"] }, status: :unprocessable_entity
          end

          if permitted[:channel] == "email" && permitted[:subject].blank?
            return render json: { errors: ["Email subject is required"] }, status: :unprocessable_entity
          end
        end

        delivery = LeadNotificationService.queue_manual(
          @lead,
          channel: permitted[:channel],
          recipient_role: permitted[:recipient_role],
          event_name: permitted[:event_name].presence || "manual_update",
          sent_by: current_user,
          subject: permitted[:subject],
          title: permitted[:title],
          body: permitted[:body]
        )

        if delivery
          render json: { notification_delivery: NotificationDeliverySerializer.summary(delivery) }, status: :accepted
        else
          render json: { errors: ["No #{permitted[:recipient_role]} #{permitted[:channel]} recipient is available for this lead"] }, status: :unprocessable_entity
        end
      end

      private

      def set_lead
        @lead = staff_lead_scope.find(params[:id])
      end

      def filtered_staff_leads
        leads = staff_lead_scope
        assigned_agent_id = params[:assigned_agent_id].presence
        return leads unless assigned_agent_id
        return leads.where(assigned_agent_id: nil) if assigned_agent_id == "unassigned"

        unless assigned_agent_id.match?(/\A\d+\z/)
          render json: { errors: ["assigned_agent_id must be a numeric id or unassigned"] }, status: :unprocessable_entity
          return Lead.none
        end

        leads.where(assigned_agent_id: assigned_agent_id.to_i)
      end

      def apply_lead_update_params
        permitted = lead_update_params

        if permitted.key?(:assigned_agent_id)
          assigned_agent_id = permitted.delete(:assigned_agent_id)
          if assigned_agent_id.present?
            assigned_agent = assignable_agents_for(@lead).find_by(id: assigned_agent_id)
            unless assigned_agent
              render json: { errors: ["Assigned agent is not available for this lead"] }, status: :unprocessable_entity
              return false
            end

            @lead.assigned_agent = assigned_agent
            @lead.brokerage ||= assigned_agent.brokerage
          else
            @lead.assigned_agent = nil
          end
        end

        if permitted.key?(:requested_agent_id)
          requested_agent_id = permitted.delete(:requested_agent_id)
          if requested_agent_id.present?
            requested_agent = assignable_agents_for(@lead).find_by(id: requested_agent_id)
            unless requested_agent
              render json: { errors: ["Requested agent is not available for this lead"] }, status: :unprocessable_entity
              return false
            end

            @lead.requested_agent = requested_agent
            @lead.brokerage ||= requested_agent.brokerage
          else
            @lead.requested_agent = nil
          end
        end

        normalize_blank_lead_values(permitted)
        @lead.assign_attributes(permitted)
        @lead.last_contacted_at = Time.current if permitted.key?(:status) && contact_status?(@lead.status)
        true
      end

      def normalize_blank_lead_values(permitted)
        %i[
          phone preferred_time preferred_tour_date tour_type target_price message source_campaign source_url
          prequalified_status lender_name purchase_timeline budget_min budget_max desired_villages desired_beds desired_baths
          buyer_status already_working_with_agent qualification_notes intent_session_token
        ].each do |key|
          permitted[key] = nil if permitted.key?(key) && permitted[key].blank?
        end
      end

      def record_lead_update_activity
        trackable_fields = lead_trackable_fields
        changed_fields = @lead.previous_changes.keys & trackable_fields
        return if changed_fields.empty?

        LeadActivity.record!(
          lead: @lead,
          action: "lead_updated",
          actor: current_user,
          summary: lead_update_summary(changed_fields),
          metadata: { changes: LeadActivity.change_details(@lead.previous_changes, trackable_fields) }
        )
      end

      def lead_update_summary(changed_fields)
        labels = changed_fields.map { |field| field.to_s.humanize.downcase }
        return "Lead updated" if labels.empty?
        return "Updated #{labels.first}" if labels.one?

        "Updated #{labels.first(labels.length - 1).join(', ')} and #{labels.last}"
      end

      def record_global_lead_update_audit
        trackable_fields = lead_trackable_fields
        changes = AuditLogger.change_details(@lead.previous_changes, trackable_fields)
        return if changes.empty?

        record_audit_event(action: "lead_updated", target: @lead, lead: @lead, changes: changes)
      end

      def contact_status?(status)
        %w[contacted showing_scheduled nurturing closed lost].include?(status)
      end

      def lead_trackable_fields
        %w[
          status assigned_agent_id requested_agent_id quality_status lead_type name email phone preferred_contact_method
          preferred_time preferred_tour_date tour_type target_price message source_campaign source_url
          prequalified_status lender_name purchase_timeline budget_min budget_max desired_villages desired_beds desired_baths
          buyer_status already_working_with_agent qualification_notes quality_score
        ]
      end

      def lead_params
        params.require(:lead).permit(
          :lead_type,
          :name,
          :email,
          :phone,
          :preferred_contact_method,
          :preferred_time,
          :preferred_tour_date,
          :tour_type,
          :target_price,
          :message,
          :source_campaign,
          :source_url,
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
          :qualification_notes,
          :intent_session_token,
          :listing_id,
          :requested_agent_id
        )
      end

      def assign_routing_brokerage(lead)
        brokerage = current_routing_brokerage
        unless brokerage
          render json: { errors: ["No active brokerage is available for lead routing"] }, status: :unprocessable_entity
          return
        end

        lead.brokerage = brokerage
      end

      def assign_requested_agent_from_params(lead, requested_agent_id)
        return if requested_agent_id.blank?

        agent = Agent.active.includes(:brokerage).find_by(id: requested_agent_id)
        unless agent
          render json: { errors: ["Requested agent is not available"] }, status: :unprocessable_entity
          return
        end

        if agent.brokerage_id != lead.brokerage_id
          render json: { errors: ["Requested agent is not available for this brokerage"] }, status: :unprocessable_entity
          return
        end

        lead.requested_agent = agent
        lead.assigned_agent = agent
      end

      def active_listing_from_params(permitted)
        return nil if permitted[:listing_id].blank?

        Listing.active.find_by(id: permitted[:listing_id]).tap do |listing|
          render json: { errors: ["Listing not found"] }, status: :unprocessable_entity unless listing
        end
      end

      def lead_intent_session_from_token(token)
        return nil if token.blank?

        brokerage = current_routing_brokerage
        session = LeadIntentSession.find_scoped_by_token(token, user: current_user, brokerage: brokerage)
        return session if session

        LeadIntentSession.find_or_create_for_token!(token, user: current_user, brokerage: brokerage)
      rescue ArgumentError
        nil
      end

      def render_intent_session_scope_mismatch(error)
        render json: {
          errors: [error.message],
          reset_session: true,
          prompt: { eligible: false, reason: "session_scope_mismatch" }
        }, status: :conflict
      end

      def record_submission_context_for_empty_intent_session(lead, intent_session)
        return unless intent_session && lead.listing
        return if intent_session.lead_intent_events.exists?

        event_name = case lead.lead_type
                     when "showing_request"
                       "showing_form_opened"
                     when "price_tracker"
                       "price_tracker_opened"
                     end
        return unless event_name

        intent_session.record_event!(
          event_name: event_name,
          user: lead.user,
          brokerage: lead.brokerage,
          listing: lead.listing,
          source: "lead_submission",
          metadata: { surface: "lead_submission_recovery", source: lead.lead_type },
          occurred_at: Time.current
        )
      end

      def mark_intent_session_converted(lead, intent_session)
        return unless intent_session

        intent_session.mark_converted!(lead)
        LeadActivity.record!(
          lead: lead,
          action: "search_intent_captured",
          summary: "Search intent captured before lead conversion",
          metadata: Api::V1::LeadIntentSessionSerializer.summary(intent_session).to_h.except(:id, :requested_agent)
        )
      end

      def serialized_created_lead(lead)
        current_user&.staff? ? LeadSerializer.staff_summary(lead) : LeadSerializer.consumer(lead)
      end

      def lead_update_params
        params.require(:lead).permit(
          :status,
          :assigned_agent_id,
          :requested_agent_id,
          :quality_status,
          :lead_type,
          :name,
          :email,
          :phone,
          :preferred_contact_method,
          :preferred_time,
          :preferred_tour_date,
          :tour_type,
          :target_price,
          :message,
          :source_campaign,
          :source_url,
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
          :qualification_notes
        )
      end

      def notification_params
        params.require(:notification).permit(:channel, :recipient_role, :event_name, :subject, :title, :body).tap do |permitted|
          permitted[:channel] = permitted[:channel].presence || "email"
          permitted[:recipient_role] = permitted[:recipient_role].presence || "consumer"
        end
      end
    end
  end
end
