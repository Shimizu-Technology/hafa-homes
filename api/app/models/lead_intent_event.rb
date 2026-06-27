class LeadIntentEvent < ApplicationRecord
  EVENT_NAMES = %w[
    listing_detail_viewed
    listing_saved
    listing_unsaved
    search_filter_changed
    search_view_changed
    map_marker_clicked
    agent_selected
    agent_profile_viewed
    showing_form_opened
    price_tracker_opened
    lead_form_abandoned
    saved_search_opened
    saved_search_created
  ].freeze

  belongs_to :lead_intent_session
  belongs_to :user, optional: true
  belongs_to :listing, optional: true
  belongs_to :village, optional: true
  belongs_to :agent, optional: true
  belongs_to :brokerage, optional: true

  validates :event_name, presence: true, inclusion: { in: EVENT_NAMES }
  validates :occurred_at, presence: true

  before_validation :set_defaults

  private

  def set_defaults
    self.occurred_at ||= Time.current
    self.metadata ||= {}
  end
end
