class AuditEvent < ApplicationRecord
  belongs_to :actor, class_name: "User", optional: true
  belongs_to :brokerage, optional: true
  belongs_to :lead, optional: true

  validates :action, presence: true

  scope :recent_first, -> { order(created_at: :desc, id: :desc) }
  scope :for_brokerages, ->(brokerage_ids) { where(brokerage_id: brokerage_ids) }

  def as_api_json
    {
      id: id,
      action: action,
      actor: actor_json,
      actor_email: actor_email,
      target_type: target_type,
      target_id: target_id,
      target_label: target_label,
      brokerage_id: brokerage_id,
      lead_id: lead_id,
      metadata: metadata || {},
      changes: field_changes || {},
      ip_address: ip_address,
      user_agent: user_agent,
      created_at: created_at
    }
  end

  private

  def actor_json
    return nil unless actor

    {
      id: actor.id,
      full_name: actor.full_name,
      email: actor.email,
      role: actor.role
    }
  end
end
