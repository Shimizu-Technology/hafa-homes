class ApplicationController < ActionController::API
  private

  def current_routing_brokerage
    return @current_routing_brokerage if defined?(@current_routing_brokerage)

    @current_routing_brokerage = BrokerageResolver.resolve(request)
  end

  def record_audit_event(action:, target: nil, target_label: nil, brokerage: nil, lead: nil, metadata: {}, changes: {})
    AuditLogger.record!(
      action: action,
      actor: current_audit_actor,
      target: target,
      target_label: target_label,
      brokerage: brokerage,
      lead: lead,
      metadata: metadata,
      changes: changes,
      request: request
    )
  end

  def current_audit_actor
    respond_to?(:current_user, true) ? send(:current_user) : nil
  end
end
