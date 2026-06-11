class AuditLogger
  class << self
    def record!(action:, actor: nil, target: nil, target_label: nil, brokerage: nil, lead: nil, metadata: {}, changes: {}, request: nil)
      resolved_lead = lead || infer_lead(target)
      resolved_brokerage = brokerage || infer_brokerage(target, resolved_lead)

      AuditEvent.create!(
        actor: actor,
        actor_email: actor&.email,
        action: action,
        target_type: target&.class&.name,
        target_id: target&.id,
        target_label: target_label || label_for(target),
        brokerage: resolved_brokerage,
        lead: resolved_lead,
        ip_address: request&.remote_ip,
        user_agent: request&.user_agent,
        metadata: sanitize_hash(metadata),
        changes: sanitize_hash(changes)
      )
    rescue StandardError => e
      Rails.logger.warn("[AuditLogger] Unable to record #{action}: #{e.class} #{e.message}")
      nil
    end

    def change_details(previous_changes, fields)
      previous_changes.slice(*fields.map(&:to_s)).transform_values do |values|
        before, after = values
        { from: safe_value(before), to: safe_value(after) }
      end
    end

    private

    def infer_lead(target)
      return target if target.is_a?(Lead)
      return target.lead if target.respond_to?(:lead)

      nil
    end

    def infer_brokerage(target, lead)
      return target if target.is_a?(Brokerage)
      return target.brokerage if target.respond_to?(:brokerage) && target.brokerage
      return lead.brokerage if lead&.brokerage

      nil
    end

    def label_for(target)
      return nil unless target
      return target.full_name if target.respond_to?(:full_name)
      return target.name if target.respond_to?(:name)
      return target.title if target.respond_to?(:title)
      return target.email if target.respond_to?(:email)

      "#{target.class.name} ##{target.id}"
    end

    def sanitize_hash(value)
      return {} unless value.respond_to?(:to_h)

      value.to_h.deep_stringify_keys.transform_values { |item| safe_value(item) }
    end

    def safe_value(value)
      case value
      when Hash
        value.deep_stringify_keys.transform_values { |item| safe_value(item) }
      when Array
        value.map { |item| safe_value(item) }
      when Time, Date, ActiveSupport::TimeWithZone
        value.iso8601
      else
        value
      end
    end
  end
end
