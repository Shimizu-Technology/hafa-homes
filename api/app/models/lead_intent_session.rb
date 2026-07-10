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
    return existing_event if existing_event

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

    profile_context = search_profile_prompt_context(trigger)
    return ineligible_prompt(profile_context[:ineligible_reason]) if profile_context&.key?(:ineligible_reason)

    prompt_key = [
      profile_context&.fetch(:kind) || "lead",
      trigger[:key],
      summary.fetch("unique_listing_view_count", 0),
      summary.fetch("saved_listing_count", 0),
      summary.fetch("form_abandon_count", 0),
      summary.fetch("search_filter_count", 0)
    ].join(":")
    return ineligible_prompt("already_prompted") if last_prompt_key == prompt_key

    self.class.transaction do
      update_columns(last_prompt_key: prompt_key, updated_at: Time.current)
      profile_context&.dig(:profile)&.update_column(:last_prompted_at, Time.current) if profile_context&.dig(:profile)&.persisted?
    end

    {
      eligible: true,
      key: prompt_key,
      trigger: trigger[:key],
      title: profile_context&.dig(:title) || trigger[:title],
      body: profile_context&.dig(:body) || trigger[:body],
      cta: profile_context&.dig(:cta) || "Get matched with an agent",
      snooze_hours: prompt_snooze_hours,
      profile_prompt: profile_context.present?,
      profile_prompt_kind: profile_context&.dig(:kind),
      create_lead_default: profile_context ? false : true,
      suggested: suggested_prompt_defaults(profile_context&.dig(:profile)),
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
    events = lead_intent_events
    listing_view_events = events.where(event_name: "listing_detail_viewed").where.not(listing_id: nil)
    saved_events = events.where(event_name: "listing_saved").where.not(listing_id: nil)
    event_count = events.count
    listing_view_count = listing_view_events.count
    unique_listing_ids = listing_view_events
      .group(:listing_id)
      .order(Arel.sql("MAX(occurred_at) DESC"))
      .limit(MAX_SUMMARY_IDS)
      .pluck(:listing_id)
    saved_listing_ids = saved_events
      .group(:listing_id)
      .order(Arel.sql("MAX(occurred_at) DESC"))
      .limit(MAX_SUMMARY_IDS)
      .pluck(:listing_id)
    village_counts = listing_view_events
      .joins("LEFT JOIN listings AS village_listings ON village_listings.id = lead_intent_events.listing_id")
      .joins(<<~SQL.squish)
        INNER JOIN villages AS resolved_villages
          ON resolved_villages.id = COALESCE(lead_intent_events.village_id, village_listings.village_id)
      SQL
      .group("resolved_villages.name")
      .order(Arel.sql("COUNT(*) DESC, resolved_villages.name ASC"))
      .limit(5)
      .count
    viewed_price_min, viewed_price_max = listing_view_events
      .joins(:listing)
      .pick(Arel.sql("MIN(listings.price)"), Arel.sql("MAX(listings.price)"))
    latest_listing_event = listing_view_events.includes(:listing).order(occurred_at: :desc, id: :desc).first
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
      events_count: event_count,
      listing_view_count: listing_view_count,
      unique_listing_view_count: listing_view_events.distinct.count(:listing_id),
      unique_listing_ids: unique_listing_ids,
      saved_listing_count: saved_events.distinct.count(:listing_id),
      saved_listing_ids: saved_listing_ids,
      top_villages: village_counts.map { |name, count| { name: name, count: count } },
      viewed_price_min: viewed_price_min&.to_f,
      viewed_price_max: viewed_price_max&.to_f,
      latest_listing_id: latest_listing_event&.listing_id,
      latest_listing_title: latest_listing_event&.listing&.title,
      form_open_count: events.where(event_name: %w[showing_form_opened price_tracker_opened]).count,
      form_abandon_count: events.where(event_name: "lead_form_abandoned").count,
      search_filter_count: events.where(event_name: "search_filter_changed").count,
      agent_selected_count: events.where(event_name: "agent_selected").count
    }.compact

    update_columns(summary: next_summary.deep_stringify_keys.merge(prompt_state_summary), events_count: event_count, last_seen_at: Time.current, updated_at: Time.current)
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

  def search_profile_prompt_context(_trigger)
    return nil unless user

    profile = user.buyer_search_profiles.find_by(brokerage: brokerage)
    return finish_search_profile_context(profile) unless profile&.complete?

    divergence = search_profile_divergence(profile)
    return update_search_profile_context(profile, divergence) if divergence

    { ineligible_reason: "complete_search_profile" }
  end

  def finish_search_profile_context(profile)
    {
      kind: "finish_search_profile",
      profile: profile,
      title: "Save your search profile once.",
      body: "Add your budget, villages, timeline, and readiness to your account so Hafa Homes can prefill requests and route your search better.",
      cta: "Save search profile"
    }
  end

  def update_search_profile_context(profile, divergence)
    {
      kind: "update_search_profile",
      profile: profile,
      title: "Update your search profile?",
      body: search_profile_divergence_message(divergence),
      cta: "Update profile"
    }
  end

  def search_profile_divergence(profile)
    village_name = divergent_viewed_village_name(profile)
    return { kind: :village, village_name: village_name } if village_name.present?
    return { kind: :price } if viewed_prices_outside_profile?(profile)

    nil
  end

  def divergent_viewed_village_name(profile)
    saved_villages = split_village_names(profile.desired_villages)
    return nil if saved_villages.empty?

    divergent_village = summary.fetch("top_villages", []).find do |village|
      name = village["name"].to_s.squish
      village["count"].to_i >= 2 && name.present? && saved_villages.none? { |saved| village_names_match?(saved, name) }
    end
    divergent_village&.fetch("name", nil)
  end

  def viewed_prices_outside_profile?(profile)
    viewed_min = summary["viewed_price_min"].to_f if summary["viewed_price_min"].present?
    viewed_max = summary["viewed_price_max"].to_f if summary["viewed_price_max"].present?
    budget_min = profile.budget_min&.to_f
    budget_max = profile.budget_max&.to_f
    return false unless viewed_min || viewed_max

    (budget_min && viewed_max && viewed_max < budget_min * 0.9) || (budget_max && viewed_min && viewed_min > budget_max * 1.1)
  end

  def search_profile_divergence_message(divergence)
    if divergence[:kind] == :village && divergence[:village_name].present?
      return "You have been looking around #{divergence[:village_name]}. Add it to your saved preferences so future requests and agent follow-up match your real search."
    end

    if divergence[:kind] == :price
      return "Your recent browsing is outside your saved budget range. Update your profile so Hafa Homes can prefill requests with the right price context."
    end

    "Your recent browsing looks different from your saved profile. Update your preferences so Hafa Homes can prefill future requests correctly."
  end

  def suggested_prompt_defaults(profile = nil)
    top_villages = summary.fetch("top_villages", []).map { |village| village["name"] }.compact.first(3)
    {
      preferred_contact_method: profile&.preferred_contact_method,
      phone: profile&.phone,
      prequalified_status: profile&.prequalified_status,
      lender_name: profile&.lender_name,
      purchase_timeline: profile&.purchase_timeline,
      desired_villages: suggested_desired_villages(profile, top_villages),
      budget_min: suggested_budget_min(profile),
      budget_max: suggested_budget_max(profile),
      desired_beds: profile&.desired_beds,
      desired_baths: profile&.desired_baths,
      buyer_status: profile&.buyer_status,
      already_working_with_agent: profile&.already_working_with_agent,
      notes: profile&.notes,
      listing_id: summary["latest_listing_id"]
    }.compact
  end

  def suggested_desired_villages(profile, top_villages)
    village_names = split_village_names(profile&.desired_villages)
    top_villages.each do |village|
      normalized = village.to_s.squish
      next if normalized.blank?
      next if village_names.any? { |saved| village_names_match?(saved, normalized) }

      village_names << normalized
    end
    village_names.join(", ").presence
  end

  def split_village_names(value)
    value.to_s.split(/[,;]+/).map(&:squish).reject(&:blank?)
  end

  def village_names_match?(first, second)
    normalized_first = first.to_s.downcase.squish
    normalized_second = second.to_s.downcase.squish
    normalized_first == normalized_second ||
      normalized_first.include?(normalized_second) ||
      normalized_second.include?(normalized_first)
  end

  def suggested_budget_min(profile)
    combined_budget_bound(profile&.budget_min, summary["viewed_price_min"], :min)
  end

  def suggested_budget_max(profile)
    combined_budget_bound(profile&.budget_max, summary["viewed_price_max"], :max)
  end

  def combined_budget_bound(saved_value, viewed_value, direction)
    values = [ saved_value, viewed_value ].filter_map { |value| decimal_value(value) }
    return nil if values.empty?

    (direction == :min ? values.min : values.max).to_f
  end

  def decimal_value(value)
    return nil if value.blank?

    BigDecimal(value.to_s)
  rescue ArgumentError
    nil
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
