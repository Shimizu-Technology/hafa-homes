require "digest"
require "json"

module Api
  module V1
    class LeadsController < ApplicationController
      include ClerkAuthenticatable
      include StaffLeadScoping
      include PaginatedResponse

      MINIMUM_INTENT_EVENTS_FOR_LEAD_LINK = 2
      MEANINGFUL_INTENT_EVENTS_FOR_LEAD_LINK = %w[
        listing_detail_viewed
        listing_saved
        search_filter_changed
        map_marker_clicked
        saved_search_created
      ].freeze

      class InsufficientLeadIntentContextError < StandardError; end

      before_action :authenticate_user!, only: [ :index, :show, :update, :send_notification ]
      before_action :require_staff!, only: [ :index, :show, :update, :send_notification ]
      before_action :authenticate_user_optional, only: [ :create ]
      before_action :set_lead, only: [ :show, :update, :send_notification ]

      def index
        leads = filtered_staff_leads
        return if performed?

        leads = ordered_staff_leads(leads)
        return if performed?

        response = paginated_response(leads, :leads, default_per_page: 100, max_per_page: 100) do |lead|
          LeadSerializer.staff_summary(lead)
        end
        response[:assignable_agents] = assignable_agents_for_scope.map(&:as_api_json)
        response[:metrics] = lead_inbox_metrics

        render json: response
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
        brokerage = current_routing_brokerage
        unless brokerage
          render json: { errors: [ "No active brokerage is available for lead routing" ] }, status: :unprocessable_entity
          return
        end

        idempotency_key = request.headers["Idempotency-Key"].to_s.strip.presence
        if idempotency_key && !Lead::IDEMPOTENCY_KEY_FORMAT.match?(idempotency_key)
          render json: {
            errors: [ "Idempotency key is invalid" ],
            reset_idempotency_key: true
          }, status: :unprocessable_entity
          return
        end
        idempotency_fingerprint = lead_submission_fingerprint(permitted, user: current_user)
        return if replay_idempotent_lead(brokerage, idempotency_key, idempotency_fingerprint)

        intent_session = lead_intent_session_from_token(
          permitted.delete(:intent_session_token),
          require_context: permitted[:lead_type] == "search_assist"
        )
        lead = Lead.new(permitted.except(:listing_id, :requested_agent_id))
        lead.brokerage = brokerage
        lead.idempotency_key = idempotency_key
        lead.idempotency_fingerprint = idempotency_fingerprint if idempotency_key
        lead.listing = active_listing_from_params(permitted)
        return if performed?

        assign_requested_agent_from_params(lead, permitted[:requested_agent_id])
        return if performed?

        if current_user
          lead.user = current_user
          apply_current_user_search_profile(lead)
        end
        lead.lead_intent_session = intent_session if intent_session
        lead.queue_request_received_notification = true

        saved = Lead.transaction do
          next false unless lead.save

          intent_session&.mark_converted!(lead)
          true
        end

        if saved
          record_intent_conversion_activity(lead, intent_session)
          record_lead_creation_audit(lead, intent_session)
          render json: { lead: serialized_created_lead(lead) }, status: :created
        else
          render json: { errors: lead.errors.full_messages }, status: :unprocessable_entity
        end
      rescue LeadIntentSession::ScopeMismatchError => e
        render_intent_session_scope_mismatch(e)
      rescue InsufficientLeadIntentContextError => e
        render_insufficient_intent_context(e)
      rescue ActiveRecord::RecordNotUnique
        return if replay_idempotent_lead(brokerage, idempotency_key, idempotency_fingerprint)

        raise
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
          return render json: { errors: [ "Notification recipient or channel is invalid" ] }, status: :unprocessable_entity
        end

        if permitted[:event_name].blank? || permitted[:event_name] == "manual_update"
          if permitted[:body].blank?
            return render json: { errors: [ "Message body is required" ] }, status: :unprocessable_entity
          end

          if permitted[:channel] == "email" && permitted[:subject].blank?
            return render json: { errors: [ "Email subject is required" ] }, status: :unprocessable_entity
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
          render json: { errors: [ "No #{permitted[:recipient_role]} #{permitted[:channel]} recipient is available for this lead" ] }, status: :unprocessable_entity
        end
      end

      private

      def set_lead
        @lead = staff_lead_scope.find(params[:id])
      end

      def filtered_staff_leads
        leads = staff_lead_scope

        assigned_agent_id = params[:assigned_agent_id].presence
        if assigned_agent_id
          if assigned_agent_id == "unassigned"
            leads = leads.where(assigned_agent_id: nil)
          elsif assigned_agent_id.match?(/\A\d+\z/)
            leads = leads.where(assigned_agent_id: assigned_agent_id.to_i)
          else
            render json: { errors: [ "assigned_agent_id must be a numeric id or unassigned" ] }, status: :unprocessable_entity
            return Lead.none
          end
        end

        lead_type = params[:lead_type].presence
        if lead_type
          unless lead_type.match?(/\A[a-z_]+\z/)
            render json: { errors: [ "lead_type is invalid" ] }, status: :unprocessable_entity
            return Lead.none
          end

          leads = leads.where(lead_type: lead_type)
        end

        status = params[:status].presence
        if status
          unless Lead::STATUSES.include?(status)
            render json: { errors: [ "status is invalid" ] }, status: :unprocessable_entity
            return Lead.none
          end

          leads = leads.where(status: status)
        end

        search = params[:q].to_s.strip
        leads = apply_lead_search_filter(leads, search) if search.present?
        leads
      end

      def lead_inbox_metrics
        scope = staff_lead_scope
        {
          open_leads: scope.where(status: %w[new contacted showing_scheduled nurturing]).count,
          new_leads: scope.where(status: "new").count,
          showing_leads: scope.where(status: "showing_scheduled").count,
          price_watch_leads: scope.where(lead_type: "price_tracker").count
        }
      end

      def apply_lead_search_filter(leads, search)
        query = "%#{ActiveRecord::Base.sanitize_sql_like(search.downcase)}%"
        agent_ids = Agent.where("LOWER(name) LIKE :query OR LOWER(COALESCE(email, '')) LIKE :query", query: query).limit(1_000).pluck(:id)
        clauses = [
          "LOWER(leads.name) LIKE :query",
          "LOWER(leads.email) LIKE :query",
          "LOWER(COALESCE(leads.phone, '')) LIKE :query",
          "LOWER(COALESCE(leads.message, '')) LIKE :query",
          "LOWER(COALESCE(leads.lead_type, '')) LIKE :query",
          "LOWER(COALESCE(listings.title, '')) LIKE :query",
          "LOWER(COALESCE(listings.address, '')) LIKE :query",
          "LOWER(COALESCE(brokerages.name, '')) LIKE :query"
        ]
        binds = { query: query }

        if search.match?(/\A\d+\z/)
          clauses << "leads.id = :lead_id"
          binds[:lead_id] = search.to_i
        end

        if agent_ids.any?
          clauses << "leads.assigned_agent_id IN (:agent_ids)"
          clauses << "leads.requested_agent_id IN (:agent_ids)"
          binds[:agent_ids] = agent_ids
        end

        leads.left_joins(:listing, :brokerage).where(clauses.join(" OR "), binds)
      end

      def ordered_staff_leads(leads)
        case params[:sort].presence || "newest"
        when "newest"
          leads.order(created_at: :desc)
        when "oldest"
          leads.order(created_at: :asc)
        when "updated"
          leads.order(updated_at: :desc, created_at: :desc)
        when "quality_desc"
          leads.order(quality_score: :desc, created_at: :desc)
        when "quality_asc"
          leads.order(quality_score: :asc, created_at: :desc)
        else
          render json: { errors: [ "sort is invalid" ] }, status: :unprocessable_entity
          Lead.none
        end
      end

      def apply_lead_update_params
        permitted = lead_update_params

        if permitted.key?(:assigned_agent_id)
          assigned_agent_id = permitted.delete(:assigned_agent_id)
          if assigned_agent_id.present?
            assigned_agent = assignable_agents_for(@lead).find_by(id: assigned_agent_id)
            unless assigned_agent
              render json: { errors: [ "Assigned agent is not available for this lead" ] }, status: :unprocessable_entity
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
              render json: { errors: [ "Requested agent is not available for this lead" ] }, status: :unprocessable_entity
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

      def lead_submission_fingerprint(permitted, user:)
        canonical = canonical_idempotency_value({
          owner: user ? "user:#{user.id}" : "anonymous",
          lead: permitted.to_h
        })
        Digest::SHA256.hexdigest(JSON.generate(canonical))
      end

      def canonical_idempotency_value(value)
        case value
        when Hash
          value.to_h.sort.to_h.transform_values { |item| canonical_idempotency_value(item) }
        when Array
          value.map { |item| canonical_idempotency_value(item) }
        else
          value
        end
      end

      def replay_idempotent_lead(brokerage, idempotency_key, fingerprint)
        return false if brokerage.blank? || idempotency_key.blank?

        existing = Lead.find_by(brokerage: brokerage, idempotency_key: idempotency_key)
        return false unless existing

        if existing.idempotency_fingerprint != fingerprint
          render json: {
            errors: [ "Idempotency-Key was already used for a different request" ],
            reset_idempotency_key: true
          }, status: :conflict
          return true
        end

        response.set_header("Idempotency-Replayed", "true")
        render json: { lead: serialized_created_lead(existing), idempotency_replayed: true }, status: :ok
        true
      end

      def assign_requested_agent_from_params(lead, requested_agent_id)
        return if requested_agent_id.blank?

        agent = Agent.active.includes(:brokerage).find_by(id: requested_agent_id)
        unless agent
          render json: { errors: [ "Requested agent is not available" ] }, status: :unprocessable_entity
          return
        end

        if agent.brokerage_id != lead.brokerage_id
          render json: { errors: [ "Requested agent is not available for this brokerage" ] }, status: :unprocessable_entity
          return
        end

        lead.requested_agent = agent
        lead.assigned_agent = agent
      end

      def active_listing_from_params(permitted)
        return nil if permitted[:listing_id].blank?

        Listing.active.find_by(id: permitted[:listing_id]).tap do |listing|
          render json: { errors: [ "Listing not found" ] }, status: :unprocessable_entity unless listing
        end
      end

      def lead_intent_session_from_token(token, require_context: false)
        return nil if token.blank?

        brokerage = current_routing_brokerage
        session = LeadIntentSession.find_scoped_by_token(token, user: current_user, brokerage: brokerage)
        return nil unless session
        return session if sufficient_lead_intent_context?(session)
        raise InsufficientLeadIntentContextError, "Intent session needs more current browsing context before lead submission" if require_context

        nil
      rescue ArgumentError
        nil
      end

      def render_intent_session_scope_mismatch(error)
        render json: {
          errors: [ error.message ],
          reset_session: true,
          prompt: { eligible: false, reason: "session_scope_mismatch" }
        }, status: :conflict
      end

      def render_insufficient_intent_context(error)
        render json: {
          errors: [ error.message ],
          rebuild_intent_context: true,
          prompt: { eligible: false, reason: "insufficient_intent_context" }
        }, status: :conflict
      end

      def sufficient_lead_intent_context?(session)
        events = session.lead_intent_events
        events.where(event_name: MEANINGFUL_INTENT_EVENTS_FOR_LEAD_LINK).count >= MINIMUM_INTENT_EVENTS_FOR_LEAD_LINK
      end

      def apply_current_user_search_profile(lead)
        profile = current_user&.buyer_search_profiles&.find_by(brokerage: lead.brokerage)
        return unless profile

        profile.apply_to_lead(lead)
      end

      def record_intent_conversion_activity(lead, intent_session)
        return unless intent_session

        LeadActivity.record!(
          lead: lead,
          action: "search_intent_captured",
          summary: "Search intent captured before lead conversion",
          metadata: Api::V1::LeadIntentSessionSerializer.summary(intent_session).to_h.except(:id, :requested_agent)
        )
      rescue StandardError => e
        Rails.logger.warn("Unable to record intent conversion activity for lead #{lead.id}: #{e.class} #{e.message}")
      end

      def record_lead_creation_audit(lead, intent_session)
        record_audit_event(
          action: "lead_created",
          target: lead,
          lead: lead,
          metadata: { lead_type: lead.lead_type, source: lead.lead_source, lead_intent_session_id: intent_session&.id }
        )
      rescue StandardError => e
        Rails.logger.warn("Unable to record creation audit for lead #{lead.id}: #{e.class} #{e.message}")
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
