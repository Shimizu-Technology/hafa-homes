module Api
  module V1
    class LeadTasksController < ApplicationController
      include ClerkAuthenticatable
      include StaffLeadScoping
      include PaginatedResponse

      before_action :authenticate_user!
      before_action :require_staff!

      def index
        lead = staff_lead_scope.find(params[:lead_id])
        tasks = filtered_tasks(lead.lead_tasks.includes(:assigned_to, :created_by, :completed_by, :archived_by)).open_first
        response = paginated_response(tasks, :lead_tasks) { |task| Api::V1::LeadTaskSerializer.summary(task) }
        render json: response
      end

      def create
        lead = staff_lead_scope.find(params[:lead_id])
        task = lead.lead_tasks.build(task_params)
        task.created_by = current_user
        task.assigned_to ||= current_user if current_user.agent? && task.assigned_to.blank?

        if task.save
          render json: { lead_task: Api::V1::LeadTaskSerializer.summary(task), lead: LeadSerializer.detail(lead.reload) }, status: :created
        else
          render json: { errors: task.errors.full_messages }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      def update
        task = LeadTask.where(lead_id: staff_lead_scope.select(:id)).find(params[:id])
        task.assign_attributes(task_update_params)
        task.activity_actor = current_user
        apply_completion_actor(task)

        if task.save
          render json: { lead_task: Api::V1::LeadTaskSerializer.summary(task), lead: LeadSerializer.detail(task.lead.reload) }
        else
          render json: { errors: task.errors.full_messages }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordInvalid => e
        render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
      end

      private

      def task_params
        params.require(:lead_task).permit(:title, :notes, :due_at, :assigned_to_id).tap do |permitted|
          permitted[:assigned_to_id] = assignable_user_id(permitted[:assigned_to_id]) if permitted[:assigned_to_id].present?
        end
      end

      def task_update_params
        params.require(:lead_task).permit(:title, :notes, :due_at, :status, :assigned_to_id).tap do |permitted|
          permitted[:assigned_to_id] = assignable_user_id(permitted[:assigned_to_id]) if permitted[:assigned_to_id].present?
        end
      end

      def assignable_user_id(user_id)
        user = User.find_by(id: user_id)
        return user.id if user&.staff?

        raise ActiveRecord::RecordInvalid, current_user.tap { |current| current.errors.add(:base, "Assigned user is not available") }
      end

      def apply_completion_actor(task)
        return unless task.status_changed?

        if task.status == "completed"
          task.completed_by = current_user
          task.completed_at ||= Time.current
        elsif task.status == "open"
          task.completed_by = nil
          task.completed_at = nil
        end
      end

      def filtered_tasks(scope)
        case params[:status]
        when "open"
          scope.where(status: "open")
        when "completed"
          scope.where(status: "completed")
        when "archived", "cancelled"
          scope.where(status: "cancelled")
        when "all"
          scope
        else
          scope.active_status
        end
      end
    end
  end
end
