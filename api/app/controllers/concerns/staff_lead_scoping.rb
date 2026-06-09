module StaffLeadScoping
  extend ActiveSupport::Concern

  private

  def staff_lead_scope
    base = Lead
      .includes(:brokerage, :assigned_agent, { showing_appointments: [:listing, :brokerage, :agent, :created_by] }, listing: [:village, :brokerage, :agent])

    return base if current_user.platform_admin?

    brokerage_admin_ids = authorized_brokerage_admin_ids
    agent_ids = authorized_agent_ids
    return base.none if brokerage_admin_ids.empty? && agent_ids.empty?

    scoped = nil
    scoped = base.where(brokerage_id: brokerage_admin_ids) if brokerage_admin_ids.any?
    agent_scope = base.where(assigned_agent_id: agent_ids) if agent_ids.any?
    scoped = scoped ? scoped.or(agent_scope) : agent_scope if agent_scope
    scoped || base.none
  end

  def staff_showing_appointment_scope
    ShowingAppointment.where(lead_id: staff_lead_scope.select(:id))
  end

  def assignable_agents_for_scope
    return Agent.includes(:brokerage).active.order(:name) if current_user.platform_admin?

    brokerage_admin_ids = authorized_brokerage_admin_ids
    if brokerage_admin_ids.any?
      return Agent.includes(:brokerage).active.where(brokerage_id: brokerage_admin_ids).order(:name)
    end

    Agent.includes(:brokerage).active.where(id: authorized_agent_ids).order(:name)
  end

  def assignable_agents_for(lead)
    agents = assignable_agents_for_scope
    brokerage_id = lead.brokerage_id || lead.assigned_agent&.brokerage_id
    return agents if brokerage_id.blank?

    agents.where(brokerage_id: brokerage_id)
  end

  def authorized_brokerage_admin_ids
    @authorized_brokerage_admin_ids ||= current_user.active_brokerage_admin_ids
  end

  def authorized_agent_ids
    @authorized_agent_ids ||= current_user.active_agent_ids
  end
end
