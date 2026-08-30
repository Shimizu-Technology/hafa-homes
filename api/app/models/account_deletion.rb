require "digest"

class AccountDeletion < ApplicationRecord
  STATUSES = %w[pending processing failed completed].freeze

  belongs_to :user, optional: true

  validates :clerk_id_digest, :requested_at, presence: true
  validates :clerk_id_digest, uniqueness: true
  validates :status, inclusion: { in: STATUSES }
  validates :clerk_id, presence: true, unless: :provider_deleted?

  scope :retryable, -> { where(status: %w[pending failed]) }
  scope :processing_before, ->(time) { where(status: "processing", updated_at: ..time) }

  class << self
    def digest_for(clerk_id)
      Digest::SHA256.hexdigest(clerk_id.to_s)
    end

    def blocks_clerk_id?(clerk_id)
      return false if clerk_id.blank?

      exists?(clerk_id_digest: digest_for(clerk_id))
    end

    def request_for!(user)
      transaction do
        locked_user = User.lock.find(user.id)
        deletion = lock.find_or_initialize_by(clerk_id_digest: digest_for(locked_user.clerk_id))
        deletion.assign_attributes(
          user: locked_user,
          clerk_id: locked_user.clerk_id,
          status: "pending",
          requested_at: Time.current,
          last_error: nil
        )
        deletion.save!
        locked_user.archive! unless locked_user.archived?
        deletion
      end
    end
  end

  def provider_deleted?
    provider_deleted_at.present? || status == "completed"
  end

  def completed?
    status == "completed"
  end

  def claim_for_processing!
    claimed = self.class
      .where(id: id, status: %w[pending failed])
      .update_all([ "status = 'processing', attempt_count = attempt_count + 1, last_attempt_at = ?, updated_at = ?", Time.current, Time.current ])
    reload if claimed == 1
    claimed == 1
  end

  def mark_provider_deleted!
    update!(provider_deleted_at: Time.current, clerk_id: nil, last_error: nil)
  end

  def mark_failed!(message)
    update!(status: "failed", last_error: message.to_s.truncate(500)) unless completed?
  end

  def recover_interrupted!(cutoff:)
    with_lock do
      return false unless status == "processing" && updated_at <= cutoff

      update!(status: "failed", last_error: "Recovered interrupted account deletion")
    end
    true
  end

  def complete!
    with_lock do
      return if completed?
      raise ActiveRecord::RecordInvalid.new(self) unless provider_deleted?

      user_record = User.lock.find_by(id: user_id)
      if user_record
        anonymize_audit_events!(user_record)
        update!(user: nil)
        user_record.destroy!
      end

      update!(status: "completed", clerk_id: nil, completed_at: Time.current, last_error: nil)
    end
  end

  private

  def anonymize_audit_events!(user_record)
    anonymized_at = Time.current
    AuditEvent.where(actor_id: user_record.id).update_all(
      actor_id: nil,
      actor_email: nil,
      metadata: {},
      field_changes: {},
      ip_address: nil,
      user_agent: nil,
      updated_at: anonymized_at
    )
    AuditEvent.where(target_type: "User", target_id: user_record.id).update_all(
      target_label: "Deleted account",
      metadata: {},
      field_changes: {},
      ip_address: nil,
      user_agent: nil,
      updated_at: anonymized_at
    )
  end
end
