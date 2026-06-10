module Api
  module V1
    class LeadActivitySerializer
      class << self
        def summary(activity)
          {
            id: activity.id,
            lead_id: activity.lead_id,
            action: activity.action,
            summary: activity.summary,
            metadata: activity.metadata,
            occurred_at: activity.occurred_at,
            actor: user_json(activity.actor),
            subject_type: activity.subject_type,
            subject_id: activity.subject_id,
            created_at: activity.created_at
          }
        end

        private

        def user_json(user)
          return nil unless user

          {
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            role: user.role
          }
        end
      end
    end
  end
end
