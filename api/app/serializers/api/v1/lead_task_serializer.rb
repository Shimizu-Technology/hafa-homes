module Api
  module V1
    class LeadTaskSerializer
      class << self
        def summary(task)
          {
            id: task.id,
            lead_id: task.lead_id,
            title: task.title,
            notes: task.notes,
            status: task.status,
            due_at: task.due_at,
            completed_at: task.completed_at,
            archived_at: task.archived_at,
            overdue: task.overdue?,
            assigned_to: user_json(task.assigned_to),
            created_by: user_json(task.created_by),
            completed_by: user_json(task.completed_by),
            archived_by: user_json(task.archived_by),
            created_at: task.created_at,
            updated_at: task.updated_at
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
