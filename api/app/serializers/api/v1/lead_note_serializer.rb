module Api
  module V1
    class LeadNoteSerializer
      class << self
        def summary(note)
          {
            id: note.id,
            lead_id: note.lead_id,
            body: note.body,
            visibility: note.visibility,
            archived_at: note.archived_at,
            author: user_json(note.author),
            archived_by: user_json(note.archived_by),
            created_at: note.created_at,
            updated_at: note.updated_at
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
