require "digest"

class LeadIntentSession < ApplicationRecord
  STATUSES = %w[active snoozed converted].freeze
  PROMPT_MODES = %w[growth balanced selective low_friction strict].freeze
  DEFAULT_LISTING_VIEW_THRESHOLD = 3
  DEFAULT_SNOOZE_HOURS = 24
  MAX_SUMMARY_IDS = 20
  DEFAULT_PROMPT_CONFIG = {
    "growth" => { listing_views_threshold: 2, same_village_threshold: 2, search_filter_threshold: 2, reprompt_unique_listing_delta: 2, reprompt_search_filter_delta: 2, max_dismissals_before_hard_snooze: 3, snooze_hours: 8 },
    "balanced" => { listing_views_threshold: 3, same_village_threshold: 2, search_filter_threshold: 3, reprompt_unique_listing_delta: 3, reprompt_search_filter_delta: 3, max_dismissals_before_hard_snooze: 2, snooze_hours: 24 },
    "selective" => { listing_views_threshold: 5, same_village_threshold: 3, search_filter_threshold: 5, reprompt_unique_listing_delta: 5, reprompt_search_filter_delta: 5, max_dismissals_before_hard_snooze: 1, snooze_hours: 72 }
  }.freeze

  class ScopeMismatchError < StandardError; end

  belongs_to :user, optional: true
  belongs_to :brokerage, optional: true
  belongs_to :requested_agent, class_name: "Agent", optional: true
  belongs_to :converted_lead, class_name: "Lead", optional: true
  has_many :lead_intent_events, dependent: :destroy
  has_many :leads, dependent: :nullify

  validates :token_digest, presence: true, uniqueness: true
  validates :status, inclusion: { in: STATUSES }
  validates :prompt_mode, inclusion: { in: PROMPT_MODES }

  before_validation :set_defaults

  def self.digest_token(token)
    normalized = token.to_s.strip
    raise ArgumentError, "Intent session token is invalid" unless normalized.length.between?(16, 128)

    Digest::SHA256.hexdigest(normalized)
  end

  def self.find_or_create_for_token!(token, user: nil, brokerage: nil)
    digest = digest_token(token)
    session = find_by(token_digest: digest)
    if session
      validate_context!(session, user:, brokerage:)
      session.claim_context!(user:, brokerage:)
      return session
    end

    create!(token_digest: digest, user: user, brokerage: brokerage, prompt_mode: prompt_mode_for(brokerage), last_seen_at: Time.current)
  rescue ActiveRecord::RecordNotUnique
    session = find_by!(token_digest: digest)
    validate_context!(session, user:, brokerage:)
    session.claim_context!(user:, brokerage:)
    session
  end

  def self.find_scoped_by_token(token, user: nil, brokerage: nil)
    session = find_by_token(token)
    return nil unless session

    validate_context!(session, user:, brokerage:)
    session.claim_context!(user:, brokerage:)
    session
  end

  def self.find_by_token(token)
    find_by(token_digest: digest_token(token))
  rescue ArgumentError
    nil
  end

  def self.prompt_mode_for(brokerage)
    mode = brokerage&.settings&.dig("lead_prompt_mode").presence
    PROMPT_MODES.include?(mode) ? mode : "balanced"
  end

  def self.canonical_prompt_mode(mode)
    case mode.to_s
    when "growth", "low_friction"
      "growth"
    when "selective", "strict"
      "selective"
    else
      "balanced"
    end
  end

  def self.validate_context!(session, user:, brokerage:)
    return if session.usable_for_context?(user:, brokerage:)

    raise ScopeMismatchError, "Intent session belongs to a different user, brokerage, or converted lead"
  end

  def usable_for_context?(user:, brokerage:, allow_converted: false)
    return false if converted? && !allow_converted
    return false if brokerage_id.present? && brokerage.blank?
    return false if brokerage_id.present? && brokerage.present? && brokerage_id != brokerage.id

    if user
      return false if user_id.blank?
      return false if user_id != user.id
    elsif user_id.present?
      return false
    end

    true
  end

  def claim_context!(user:, brokerage:)
    self.user ||= user if user
    self.brokerage ||= brokerage if brokerage
    self.prompt_mode = self.class.prompt_mode_for(self.brokerage) if prompt_mode.blank?
    self.last_seen_at = Time.current
    save! if changed?
  end

  def record_event!(event_name:, client_event_id: nil, user: nil, brokerage: nil, listing: nil, village: nil, agent: nil, source: nil, metadata: {}, occurred_at: Time.current)
    normalized_client_event_id = client_event_id.presence
    existing_event = lead_intent_events.find_by(client_event_id: normalized_client_event_id) if normalized_client_event_id
    if existing_event
      refresh_summary!
      return existing_event
    end

    with_lock do
      associate_context!(user:, brokerage:, agent:)
      event = lead_intent_events.create!(
        event_name: event_name,
        client_event_id: normalized_client_event_id,
        user: user,
        brokerage: brokerage || self.brokerage,
        listing: listing,
        village: village || listing&.village,
        agent: agent,
        source: source,
        metadata: metadata.compact,
        occurred_at: occurred_at
      )
      refresh_summary!
      event
    end
  rescue ActiveRecord::RecordNotUnique
    raise unless normalized_client_event_id

    event = lead_intent_events.find_by!(client_event_id: normalized_client_event_id)
    refresh_summary!
    event
  end

  def prompt_payload(latest_event: nil)
    return ineligible_prompt("converted") if converted?
    return ineligible_prompt("staff_user") if user&.staff?
    return ineligible_prompt("recent_lead") if recent_lead_submitted?
    return ineligible_prompt("disabled") unless progressive_prompts_enabled?
    return ineligible_prompt("snoozed") if actively_snoozed? && !allow_reprompt_after_dismissal?(latest_event)

    revive_snoozed_prompt! if status == "snoozed"

    trigger = prompt_trigger(latest_event)
    return ineligible_prompt("not_enough_intent") unless trigger

    prompt_key = [
      trigger[:key],
      summary.fetch("unique_listing_view_count", 0),
      summary.fetch("saved_listing_count", 0),
      summary.fetch("form_abandon_count", 0),
      summary.fetch("search_filter_count", 0)
    ].join(":")
    return ineligible_prompt("already_prompted") if last_prompt_key == prompt_key

    update_columns(last_prompt_key: prompt_key, updated_at: Time.current)

    {
      eligible: true,
      key: prompt_key,
      trigger: trigger[:key],
      title: trigger[:title],
      body: trigger[:body],
      cta: "Get matched with an agent",
      snooze_hours: prompt_snooze_hours,
      suggested: suggested_prompt_defaults,
      summary: public_summary
    }
  end

  def dismiss!(prompt_key:, reason: nil)
    dismissal_count = current_prompt_dismissal_count + 1
    update!(
      status: "snoozed",
      last_prompt_key: prompt_key.presence || last_prompt_key,
      prompt_snoozed_until: prompt_snooze_hours.hours.from_now,
      summary: summary.merge(
        "last_dismiss_reason" => reason.to_s.truncate(80).presence,
        "last_prompt_dismissed_at" => Time.current.iso8601,
        "prompt_dismissal_count" => dismissal_count,
        "dismissed_unique_listing_view_count" => summary.fetch("unique_listing_view_count", 0).to_i,
        "dismissed_saved_listing_count" => summary.fetch("saved_listing_count", 0).to_i,
        "dismissed_form_abandon_count" => summary.fetch("form_abandon_count", 0).to_i,
        "dismissed_search_filter_count" => summary.fetch("search_filter_count", 0).to_i
      ).compact
    )
  end

  def mark_converted!(lead)
    update!(
      converted_lead: lead,
      status: "converted",
      converted_at: Time.current,
      prompt_snoozed_until: nil
    )
  end

  def converted?
    status == "converted" || converted_lead_id.present?
  end

  def public_summary
    summary.slice(
      "events_count",
      "listing_view_count",
      "unique_listing_view_count",
      "saved_listing_count",
      "top_villages",
      "viewed_price_min",
      "viewed_price_max",
      "latest_listing_id",
      "latest_listing_title",
      "form_open_count",
      "form_abandon_count",
      "search_filter_count",
      "agent_selected_count"
    ).merge(
      "status" => status,
      "converted_at" => converted_at
    ).compact
  end

  private

  def set_defaults
    self.status ||= "active"
    self.prompt_mode ||= self.class.prompt_mode_for(brokerage)
    self.summary ||= {}
    self.events_count ||= 0
  end

  def associate_context!(user:, brokerage:, agent:)
    self.user ||= user if user
    self.brokerage ||= brokerage if brokerage
    if agent && user && (self.brokerage_id.blank? || agent.brokerage_id == self.brokerage_id)
      self.requested_agent ||= agent
    end
    self.prompt_mode = self.class.prompt_mode_for(self.brokerage) if prompt_mode.blank?
    self.status = "active" if status == "snoozed" && (prompt_snoozed_until.blank? || prompt_snoozed_until.past?)
    self.last_seen_at = Time.current
    save! if changed?
  end

  def refresh_summary!
    events = lead_intent_events.includes(:village, listing: :village).order(:occurred_at, :id).to_a
    listing_view_events = events.select { |event| event.event_name == "listing_detail_viewed" && event.listing_id.present? }
    saved_events = events.select { |event| event.event_name == "listing_saved" && event.listing_id.present? }
    form_open_events = events.select { |event| %w[showing_form_opened price_tracker_opened].include?(event.event_name) }
    village_counts = Hash.new(0)

    listing_view_events.each do |event|
      village_name = event.village&.name || event.listing&.village&.name
      village_counts[village_name] += 1 if village_name.present?
    end

    prices = listing_view_events.filter_map { |event| event.listing&.price&.to_f }
    latest_listing_event = listing_view_events.last
    prompt_state_summary = summary.slice(
      "last_dismiss_reason",
      "last_prompt_dismissed_at",
      "prompt_dismissal_count",
      "dismissed_unique_listing_view_count",
      "dismissed_saved_listing_count",
      "dismissed_form_abandon_count",
      "dismissed_search_filter_count"
    )
    next_summary = {
      events_count: events.size,
      listing_view_count: listing_view_events.size,
      unique_listing_view_count: listing_view_events.map(&:listing_id).uniq.size,
      unique_listing_ids: listing_view_events.map(&:listing_id).uniq.last(MAX_SUMMARY_IDS),
      saved_listing_count: saved_events.map(&:listing_id).uniq.size,
      saved_listing_ids: saved_events.map(&:listing_id).uniq.last(MAX_SUMMARY_IDS),
      top_villages: village_counts.sort_by { |_name, count| -count }.first(5).map { |name, count| { name: name, count: count } },
      viewed_price_min: prices.min,
      viewed_price_max: prices.max,
      latest_listing_id: latest_listing_event&.listing_id,
      latest_listing_title: latest_listing_event&.listing&.title,
      form_open_count: form_open_events.size,
      form_abandon_count: events.count { |event| event.event_name == "lead_form_abandoned" },
      search_filter_count: events.count { |event| event.event_name == "search_filter_changed" },
      agent_selected_count: events.count { |event| event.event_name == "agent_selected" }
    }.compact

    update_columns(summary: next_summary.deep_stringify_keys.merge(prompt_state_summary), events_count: events.size, last_seen_at: Time.current, updated_at: Time.current)
  end

  def prompt_trigger(latest_event)
    return saved_listing_trigger if latest_event&.event_name == "listing_saved"
    return abandoned_form_trigger if latest_event&.event_name == "lead_form_abandoned"
    return same_village_trigger if top_village_count >= same_village_threshold
    return listing_views_trigger if summary.fetch("unique_listing_view_count", 0).to_i >= listing_view_threshold
    return search_filter_trigger if summary.fetch("search_filter_count", 0).to_i >= search_filter_threshold

    nil
  end

  def saved_listing_trigger
    {
      key: "saved_listing_interest",
      title: "Want help narrowing your shortlist?",
      body: "You are saving homes. A Hafa Homes agent can send similar listings and help you compare the best fit."
    }
  end

  def abandoned_form_trigger
    {
      key: "abandoned_showing_request",
      title: "Still interested in seeing homes like this?",
      body: "Share a few search details and the brokerage team can follow up with useful matches."
    }
  end

  def same_village_trigger
    village_name = summary.fetch("top_villages", []).first&.fetch("name", nil)
    {
      key: "village_interest",
      title: village_name.present? ? "Looking around #{village_name}?" : "Looking in the same area?",
      body: "Tell us your timeline and budget so an agent can send better matches instead of a cold follow-up."
    }
  end

  def listing_views_trigger
    {
      key: "multiple_listing_views",
      title: "Want an agent to send matching homes?",
      body: "You have been comparing listings. A few details help us route your search to the right brokerage team."
    }
  end

  def search_filter_trigger
    {
      key: "search_filter_interest",
      title: "Want to save this search direction?",
      body: "Share what you are looking for and the team can help narrow Guam listings around your criteria."
    }
  end

  def suggested_prompt_defaults
    top_villages = summary.fetch("top_villages", []).map { |village| village["name"] }.compact.first(3)
    {
      desired_villages: top_villages.join(", ").presence,
      budget_min: summary["viewed_price_min"],
      budget_max: summary["viewed_price_max"],
      listing_id: summary["latest_listing_id"]
    }.compact
  end

  def ineligible_prompt(reason)
    { eligible: false, reason: reason, summary: public_summary }
  end

  def actively_snoozed?
    prompt_snoozed_until.present? && prompt_snoozed_until.future?
  end

  def allow_reprompt_after_dismissal?(latest_event)
    return true unless actively_snoozed?
    return false if current_prompt_dismissal_count >= max_dismissals_before_hard_snooze

    latest_name = latest_event&.event_name
    return true if latest_name == "listing_saved" && saved_listing_delta_since_dismissal.positive?
    return true if latest_name == "lead_form_abandoned" && form_abandon_delta_since_dismissal.positive?
    return true if unique_listing_delta_since_dismissal >= reprompt_unique_listing_delta
    return true if search_filter_delta_since_dismissal >= reprompt_search_filter_delta

    false
  end

  def revive_snoozed_prompt!
    update_columns(status: "active", prompt_snoozed_until: nil, updated_at: Time.current)
    self.status = "active"
    self.prompt_snoozed_until = nil
  end

  def current_prompt_dismissal_count
    dismissed_at = parse_summary_time(summary["last_prompt_dismissed_at"])
    return 0 unless dismissed_at
    return 0 if dismissed_at < prompt_snooze_hours.hours.ago

    summary.fetch("prompt_dismissal_count", 0).to_i
  end

  def unique_listing_delta_since_dismissal
    summary.fetch("unique_listing_view_count", 0).to_i - summary.fetch("dismissed_unique_listing_view_count", 0).to_i
  end

  def saved_listing_delta_since_dismissal
    summary.fetch("saved_listing_count", 0).to_i - summary.fetch("dismissed_saved_listing_count", 0).to_i
  end

  def form_abandon_delta_since_dismissal
    summary.fetch("form_abandon_count", 0).to_i - summary.fetch("dismissed_form_abandon_count", 0).to_i
  end

  def search_filter_delta_since_dismissal
    summary.fetch("search_filter_count", 0).to_i - summary.fetch("dismissed_search_filter_count", 0).to_i
  end

  def parse_summary_time(value)
    return nil if value.blank?

    Time.zone.parse(value.to_s)
  rescue ArgumentError
    nil
  end

  def recent_lead_submitted?
    return false unless user_id

    Lead.where(user_id: user_id).where("created_at >= ?", prompt_snooze_hours.hours.ago).exists?
  end

  def progressive_prompts_enabled?
    setting = brokerage&.settings&.dig("progressive_prompts_enabled")
    setting.nil? ? true : ActiveModel::Type::Boolean.new.cast(setting)
  end

  def listing_view_threshold
    configured = brokerage&.settings&.dig("listing_views_threshold")
    configured_value = configured.present? ? configured.to_i : 0
    configured_value.positive? ? configured_value : prompt_config.fetch(:listing_views_threshold, DEFAULT_LISTING_VIEW_THRESHOLD)
  end

  def same_village_threshold
    prompt_config.fetch(:same_village_threshold, 2)
  end

  def search_filter_threshold
    prompt_config.fetch(:search_filter_threshold, 3)
  end

  def reprompt_unique_listing_delta
    prompt_config.fetch(:reprompt_unique_listing_delta, 3)
  end

  def reprompt_search_filter_delta
    prompt_config.fetch(:reprompt_search_filter_delta, 3)
  end

  def max_dismissals_before_hard_snooze
    prompt_config.fetch(:max_dismissals_before_hard_snooze, 2)
  end

  def prompt_snooze_hours
    configured = brokerage&.settings&.dig("prompt_snooze_hours")
    configured_value = configured.present? ? configured.to_i : 0
    configured_value.positive? ? configured_value : prompt_config.fetch(:snooze_hours, DEFAULT_SNOOZE_HOURS)
  end

  def prompt_config
    DEFAULT_PROMPT_CONFIG.fetch(self.class.canonical_prompt_mode(prompt_mode), DEFAULT_PROMPT_CONFIG.fetch("balanced"))
  end

  def top_village_count
    first_village = summary.fetch("top_villages", []).first
    first_village ? first_village.fetch("count", 0).to_i : 0
  end
end
