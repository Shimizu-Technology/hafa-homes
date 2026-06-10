class LeadTask < ApplicationRecord
  STATUSES = %w[open completed cancelled].freeze

  attr_accessor :activity_actor

  belongs_to :lead
  belongs_to :assigned_to, class_name: "User", optional: true
  belongs_to :created_by, class_name: "User", optional: true
  belongs_to :completed_by, class_name: "User", optional: true
  belongs_to :archived_by, class_name: "User", optional: true

  validates :title, presence: true
  validates :status, inclusion: { in: STATUSES }

  before_validation :set_defaults
  before_save :sync_completion_fields
  before_save :sync_archive_fields
  after_create_commit :record_created_activity
  after_update_commit :record_detail_update_activity, if: :detail_fields_changed?
  after_update_commit :record_status_activity, if: :saved_change_to_status?

  scope :active_status, -> { where.not(status: "cancelled") }
  scope :open_first, -> { order(Arel.sql("CASE WHEN status = 'open' THEN 0 ELSE 1 END"), Arel.sql("due_at ASC NULLS LAST"), created_at: :desc) }
  scope :open_status, -> { where(status: "open") }
  scope :overdue, -> { open_status.where("due_at < ?", Time.current) }

  def open?
    status == "open"
  end

  def completed?
    status == "completed"
  end

  def cancelled?
    status == "cancelled"
  end

  def archived?
    cancelled?
  end

  def overdue?
    open? && due_at.present? && due_at < Time.current
  end

  private

  def set_defaults
    self.status ||= "open"
  end

  def sync_completion_fields
    if status_changed? && completed?
      self.completed_at ||= Time.current
    elsif status_changed? && !completed?
      self.completed_at = nil
      self.completed_by = nil
    end
  end

  def sync_archive_fields
    if status_changed? && cancelled?
      self.archived_at ||= Time.current
      self.archived_by ||= activity_actor if activity_actor
    elsif status_changed? && !cancelled?
      self.archived_at = nil
      self.archived_by = nil
    end
  end

  def record_created_activity
    LeadActivity.record!(
      lead: lead,
      action: "task_created",
      actor: created_by,
      subject: self,
      summary: "Task created: #{title}",
      metadata: { due_at: due_at, assigned_to_id: assigned_to_id }
    )
  end

  def detail_fields_changed?
    (previous_changes.keys & %w[title notes due_at assigned_to_id]).any?
  end

  def record_detail_update_activity
    changes = LeadActivity.change_details(previous_changes, %w[title notes due_at assigned_to_id])
    return if changes.empty?

    LeadActivity.record!(
      lead: lead,
      action: "task_updated",
      actor: activity_actor || created_by,
      subject: self,
      summary: "Task updated: #{title}",
      metadata: { changes: changes }
    )
  end

  def record_status_activity
    return unless completed? || open? || cancelled?

    action = if completed?
      "task_completed"
    elsif cancelled?
      "task_archived"
    else
      "task_reopened"
    end

    summary = if completed?
      "Task completed: #{title}"
    elsif cancelled?
      "Task archived: #{title}"
    else
      "Task reopened: #{title}"
    end

    LeadActivity.record!(
      lead: lead,
      action: action,
      actor: activity_actor || completed_by || archived_by,
      subject: self,
      summary: summary,
      metadata: { due_at: due_at, assigned_to_id: assigned_to_id }
    )
  end
end
