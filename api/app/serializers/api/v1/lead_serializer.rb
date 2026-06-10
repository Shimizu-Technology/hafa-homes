module Api
  module V1
    class LeadSerializer
      class << self
        def summary(lead)
          {
            id: lead.id,
            lead_type: lead.lead_type,
            name: lead.name,
            email: lead.email,
            phone: display_phone(lead.phone),
            preferred_contact_method: lead.preferred_contact_method,
            preferred_time: lead.preferred_time,
            preferred_tour_date: lead.preferred_tour_date,
            tour_type: lead.tour_type,
            target_price: lead.target_price&.to_f,
            message: lead.message,
            status: lead.status,
            quality_status: lead.quality_status,
            lead_source: lead.lead_source,
            source_campaign: lead.source_campaign,
            source_url: lead.source_url,
            last_contacted_at: lead.last_contacted_at,
            listing_id: lead.listing_id,
            user_id: lead.user_id,
            brokerage_id: lead.brokerage_id,
            assigned_agent_id: lead.assigned_agent_id,
            created_at: lead.created_at,
            updated_at: lead.updated_at,
            consumer_status_label: consumer_status_label(lead.status),
            listing: listing_json(lead.listing),
            brokerage: brokerage_json(lead.brokerage),
            assigned_agent: agent_json(lead.assigned_agent),
            latest_showing_appointment: showing_json(latest_showing(lead))
          }
        end

        def detail(lead)
          summary(lead).merge(
            showing_appointments: showing_appointments_for(lead).map { |showing| showing_json(showing) },
            notification_deliveries: notification_deliveries_for(lead).map { |delivery| Api::V1::NotificationDeliverySerializer.summary(delivery) },
            lead_notes: lead_notes_for(lead).map { |note| Api::V1::LeadNoteSerializer.summary(note) },
            lead_tasks: lead_tasks_for(lead).map { |task| Api::V1::LeadTaskSerializer.summary(task) },
            lead_activities: lead_activities_for(lead).map { |activity| Api::V1::LeadActivitySerializer.summary(activity) },
            crm_summary: crm_summary(lead)
          )
        end

        def consumer(lead)
          summary(lead).except(:quality_status, :lead_source, :source_campaign, :source_url, :last_contacted_at).merge(
            message: lead.message,
            showing_appointments: showing_appointments_for(lead).map { |showing| Api::V1::ShowingAppointmentSerializer.consumer(showing) },
            latest_showing_appointment: Api::V1::ShowingAppointmentSerializer.consumer(latest_showing(lead))
          )
        end

        private

        def display_phone(phone)
          ClicksendClient.normalize_phone(phone).presence || phone
        end

        def listing_json(listing)
          return nil unless listing

          {
            id: listing.id,
            title: listing.title,
            address: listing.address,
            price: listing.price.to_f,
            listing_kind: listing.listing_kind,
            property_type: listing.property_type,
            village: listing.village&.name,
            primary_photo_url: listing.primary_photo_url,
            brokerage: brokerage_json(listing.brokerage),
            agent: agent_json(listing.agent)
          }
        end

        def brokerage_json(brokerage)
          return nil unless brokerage

          {
            id: brokerage.id,
            name: brokerage.name,
            slug: brokerage.slug,
            status: brokerage.status,
            phone: brokerage.phone,
            website_url: brokerage.website_url,
            app_display_name: brokerage.app_display_name
          }
        end

        def agent_json(agent)
          return nil unless agent

          {
            id: agent.id,
            brokerage_id: agent.brokerage_id,
            name: agent.name,
            email: agent.email,
            phone: agent.phone,
            status: agent.status
          }
        end

        def showing_json(showing)
          return nil unless showing

          Api::V1::ShowingAppointmentSerializer.summary(showing)
        end

        def latest_showing(lead)
          showings = showing_appointments_for(lead)
          showings.find { |showing| %w[confirmed proposed].include?(showing.status) } || showings.first
        end

        def showing_appointments_for(lead)
          if lead.association(:showing_appointments).loaded?
            lead.showing_appointments.sort_by { |showing| showing.scheduled_starts_at || showing.created_at }.reverse
          else
            lead.showing_appointments.includes(:listing, :brokerage, :agent, :created_by).order(Arel.sql("scheduled_starts_at DESC NULLS LAST"), created_at: :desc)
          end
        end

        def notification_deliveries_for(lead)
          lead.notification_deliveries.recent_first.limit(10)
        end

        def lead_notes_for(lead)
          lead.lead_notes.active.includes(:author, :archived_by).recent_first.limit(10)
        end

        def lead_tasks_for(lead)
          includes = [:assigned_to, :created_by, :completed_by, :archived_by]
          open_tasks = lead.lead_tasks.where(status: "open").includes(includes).order(Arel.sql("due_at ASC NULLS LAST"), created_at: :desc).limit(15)
          completed_tasks = lead.lead_tasks.where(status: "completed").includes(includes).order(Arel.sql("completed_at DESC NULLS LAST"), updated_at: :desc).limit(5)

          open_tasks.to_a + completed_tasks.to_a
        end

        def lead_activities_for(lead)
          lead.lead_activities.includes(:actor).recent_first.limit(30)
        end

        def crm_summary(lead)
          open_tasks = lead.lead_tasks.open_status
          overdue_count = open_tasks.where("due_at < ?", Time.current).count
          next_task = open_tasks.order(Arel.sql("due_at ASC NULLS LAST"), created_at: :desc).first

          {
            open_task_count: open_tasks.count,
            overdue_task_count: overdue_count,
            completed_task_count: lead.lead_tasks.where(status: "completed").count,
            archived_task_count: lead.lead_tasks.where(status: "cancelled").count,
            note_count: lead.lead_notes.active.count,
            archived_note_count: lead.lead_notes.archived.count,
            activity_count: lead.lead_activities.count,
            next_task_due_at: next_task&.due_at,
            last_activity_at: lead.lead_activities.maximum(:occurred_at)
          }
        end

        def consumer_status_label(status)
          {
            "new" => "Request received",
            "contacted" => "Agent follow-up started",
            "showing_scheduled" => "Showing scheduled",
            "nurturing" => "Still searching",
            "closed" => "Request closed",
            "lost" => "Request closed",
            "spam" => "Request under review",
            "archived" => "Request archived"
          }[status] || "Request received"
        end
      end
    end
  end
end
