module Api
  module V1
    module Admin
      class LeadIntentSessionsController < ApplicationController
        include ClerkAuthenticatable

        MAX_PER_PAGE = 50
        DEFAULT_PER_PAGE = 20

        before_action :authenticate_user!
        before_action :require_staff!

        def index
          scope = filtered_scope(staff_intent_session_scope)
          scope = search_scope(scope)
          total_count = scope.count
          ordered_scope = ordered_sessions(scope)
          sessions = ordered_scope
            .includes(:user, :brokerage, :requested_agent, :converted_lead)
            .offset((page - 1) * per_page)
            .limit(per_page)
            .to_a

          metric_sessions = scope.where("last_seen_at >= ?", 14.days.ago).limit(500).to_a

          render json: {
            lead_intent_sessions: sessions.map { |session| Api::V1::LeadIntentSessionSerializer.admin_summary(session, include_events: true) },
            metrics: metrics_for(metric_sessions),
            top_villages: top_villages_for(metric_sessions),
            top_listings: top_listings_for(metric_sessions),
            pagination: pagination_for(total_count)
          }
        end

        private

        def filtered_scope(scope)
          filtered = scope
          filtered = filtered.where(status: params[:status]) if params[:status].present? && LeadIntentSession::STATUSES.include?(params[:status])
          case params[:identity]
          when "signed_in"
            filtered.where.not(user_id: nil)
          when "anonymous"
            filtered.where(user_id: nil)
          else
            filtered
          end
        end

        def search_scope(scope)
          query = params[:q].to_s.strip
          return scope if query.blank?

          pattern = "%#{ActiveRecord::Base.sanitize_sql_like(query)}%"
          scope.left_joins(:user, :brokerage).where(
            "users.email ILIKE :query OR users.first_name ILIKE :query OR users.last_name ILIKE :query OR brokerages.name ILIKE :query OR lead_intent_sessions.summary::text ILIKE :query",
            query: pattern
          )
        end

        def ordered_sessions(scope)
          case params[:sort]
          when "oldest"
            scope.order(Arel.sql("last_seen_at ASC NULLS LAST"), updated_at: :asc)
          when "views_desc"
            scope.order(Arel.sql("COALESCE((summary->>'unique_listing_view_count')::int, 0) DESC"), Arel.sql("last_seen_at DESC NULLS LAST"))
          when "saved_desc"
            scope.order(Arel.sql("COALESCE((summary->>'saved_listing_count')::int, 0) DESC"), Arel.sql("last_seen_at DESC NULLS LAST"))
          when "forms_desc"
            scope.order(Arel.sql("COALESCE((summary->>'form_abandon_count')::int, 0) DESC"), Arel.sql("last_seen_at DESC NULLS LAST"))
          else
            scope.order(Arel.sql("last_seen_at DESC NULLS LAST"), updated_at: :desc)
          end
        end

        def page
          @page ||= [params.fetch(:page, 1).to_i, 1].max
        end

        def per_page
          @per_page ||= [[params.fetch(:per_page, DEFAULT_PER_PAGE).to_i, 1].max, MAX_PER_PAGE].min
        end

        def pagination_for(total_count)
          {
            page: page,
            per_page: per_page,
            total_count: total_count,
            total_pages: (total_count.to_f / per_page).ceil
          }
        end

        def staff_intent_session_scope
          base = LeadIntentSession.all
          return base if current_user.platform_admin?

          brokerage_admin_ids = current_user.active_brokerage_admin_ids
          agent_ids = current_user.active_agent_ids
          return base.none if brokerage_admin_ids.empty? && agent_ids.empty?

          scoped_ids = []
          scoped_ids.concat(base.where(brokerage_id: brokerage_admin_ids).pluck(:id)) if brokerage_admin_ids.any?
          if agent_ids.any?
            scoped_ids.concat(base.where(requested_agent_id: agent_ids).pluck(:id))
            scoped_ids.concat(base.where(converted_lead_id: Lead.where(assigned_agent_id: agent_ids).select(:id)).pluck(:id))
          end

          base.where(id: scoped_ids.uniq)
        end

        def metrics_for(sessions)
          active_sessions = sessions.reject(&:converted?)
          {
            active_sessions: active_sessions.count,
            signed_in_sessions: active_sessions.count { |session| session.user_id.present? },
            high_intent_sessions: active_sessions.count { |session| high_intent?(session) },
            converted_sessions: sessions.count(&:converted?)
          }
        end

        def top_villages_for(sessions)
          counts = Hash.new(0)
          sessions.each do |session|
            Array(session.summary["top_villages"]).each do |village|
              name = village["name"].presence
              counts[name] += village["count"].to_i if name
            end
          end

          counts.sort_by { |_name, count| -count }.first(12).map { |name, count| { name: name, count: count } }
        end

        def top_listings_for(sessions)
          session_ids = sessions.map(&:id)
          return [] if session_ids.empty?

          counts_by_listing_id = LeadIntentEvent
            .where(lead_intent_session_id: session_ids, event_name: "listing_detail_viewed")
            .where.not(listing_id: nil)
            .group(:listing_id)
            .order(Arel.sql("COUNT(*) DESC"))
            .limit(12)
            .count
          listings_by_id = Listing.includes(:village).where(id: counts_by_listing_id.keys).index_by(&:id)

          counts_by_listing_id.filter_map do |listing_id, count|
            listing = listings_by_id[listing_id]
            next unless listing

            {
              id: listing.id,
              title: listing.title,
              village: listing.village&.name,
              price: listing.price&.to_f,
              listing_kind: listing.listing_kind,
              primary_photo_url: listing.primary_photo_url,
              view_count: count
            }
          end
        end

        def high_intent?(session)
          summary = session.summary
          summary["unique_listing_view_count"].to_i >= 3 ||
            summary["saved_listing_count"].to_i.positive? ||
            summary["form_abandon_count"].to_i.positive? ||
            summary["agent_selected_count"].to_i.positive?
        end
      end
    end
  end
end
