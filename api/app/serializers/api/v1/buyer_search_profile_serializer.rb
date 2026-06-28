module Api
  module V1
    class BuyerSearchProfileSerializer
      class << self
        def summary(profile, user: nil)
          effective_user = user || profile&.user
          {
            id: profile&.id,
            user_id: effective_user&.id || profile&.user_id,
            brokerage_id: profile&.brokerage_id,
            preferred_contact_method: profile&.preferred_contact_method,
            phone: profile&.phone || effective_user&.phone,
            prequalified_status: profile&.prequalified_status,
            prequalified_status_label: profile&.prequalified_status_label || "Not provided",
            lender_name: profile&.lender_name,
            purchase_timeline: profile&.purchase_timeline,
            purchase_timeline_label: profile&.purchase_timeline_label || "Not provided",
            budget_min: profile&.budget_min&.to_f,
            budget_max: profile&.budget_max&.to_f,
            budget_range_label: profile&.budget_range_label,
            desired_villages: profile&.desired_villages,
            desired_beds: profile&.desired_beds,
            desired_baths: profile&.desired_baths&.to_f,
            buyer_status: profile&.buyer_status,
            buyer_status_label: profile&.buyer_status_label || "Not provided",
            already_working_with_agent: profile&.already_working_with_agent,
            already_working_with_agent_label: profile&.already_working_with_agent_label || "Not provided",
            notes: profile&.notes,
            completed_at: profile&.completed_at,
            completion_status: profile&.completion_status || "incomplete",
            completion_percentage: profile&.completion_percentage || 0,
            completion_missing_fields: profile&.completion_missing_fields || %w[preferred_contact_method purchase_timeline search_criteria readiness],
            qualification_summary: profile&.qualification_summary,
            last_prompted_at: profile&.last_prompted_at,
            created_at: profile&.created_at,
            updated_at: profile&.updated_at
          }
        end
      end
    end
  end
end
