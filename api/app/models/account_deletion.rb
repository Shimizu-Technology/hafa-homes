require "digest"
require "securerandom"

class AccountDeletion < ApplicationRecord
  MAX_ATTEMPTS = 10
  PROCESSING_LEASE = 2.minutes
  STATUSES = %w[pending processing failed action_required completed].freeze

  belongs_to :user, optional: true

  validates :clerk_id_digest, :requested_at, presence: true
  validates :clerk_id_digest, uniqueness: true
  validates :status, inclusion: { in: STATUSES }
  validates :clerk_id, presence: true, unless: :provider_deleted?

  scope :retryable, -> { where(status: %w[pending failed]).where("attempt_count < ?", MAX_ATTEMPTS) }
  scope :exhausted, -> { where(status: %w[pending failed]).where(attempt_count: MAX_ATTEMPTS..) }
  scope :expired_processing, ->(time) { where(status: "processing", lease_expires_at: ..time) }

  class << self
    def digest_for(clerk_id)
      Digest::SHA256.hexdigest(clerk_id.to_s)
    end

    def blocks_clerk_id?(clerk_id)
      return false if clerk_id.blank?

      exists?(clerk_id_digest: digest_for(clerk_id))
    end

    def request_for!(user)
      clerk_id_digest = digest_for(user.clerk_id)
      retries = 0

      begin
        transaction(requires_new: true) do
          locked_user = User.lock.find(user.id)
          deletion = locked_tombstone(clerk_id_digest)
          unless deletion
            deletion = create_tombstone!(
              user: locked_user,
              clerk_id: locked_user.clerk_id,
              clerk_id_digest: clerk_id_digest,
              status: "pending",
              requested_at: Time.current
            )
          end
          locked_user.archive! unless locked_user.archived?
          deletion
        end
      rescue ActiveRecord::RecordNotUnique
        retries += 1
        retry if retries <= 1

        find_by!(clerk_id_digest: clerk_id_digest)
      end
    end

    private

    def locked_tombstone(clerk_id_digest)
      lock.find_by(clerk_id_digest: clerk_id_digest)
    end

    def create_tombstone!(attributes)
      create!(attributes)
    end
  end

  def provider_deleted?
    provider_deleted_at.present? || status == "completed"
  end

  def completed?
    status == "completed"
  end

  def claim_for_processing!(now: Time.current)
    token = SecureRandom.uuid
    claimed = self.class
      .where(id: id, status: %w[pending failed])
      .where("attempt_count < ?", MAX_ATTEMPTS)
      .update_all(
        status: "processing",
        attempt_count: Arel.sql("attempt_count + 1"),
        last_attempt_at: now,
        processing_token: token,
        lease_expires_at: PROCESSING_LEASE.after(now),
        updated_at: now
      )
    reload if claimed == 1
    claimed == 1 ? token : nil
  end

  def mark_provider_deleted!(processing_token:, now: Time.current)
    updated = owned_processing_scope(processing_token).update_all(
      provider_deleted_at: now,
      clerk_id: nil,
      last_error: nil,
      updated_at: now
    )
    reload if updated == 1
    updated == 1
  end

  def mark_failed!(message, processing_token:, now: Time.current)
    with_lock do
      return false unless owns_processing_token?(processing_token)

      terminal = attempt_count >= MAX_ATTEMPTS
      update!(
        status: terminal ? "action_required" : "failed",
        last_error: message.to_s.truncate(500),
        processing_token: nil,
        lease_expires_at: nil,
        updated_at: now
      )
      Rails.logger.error("Account deletion #{id} requires operator action after #{attempt_count} attempts") if terminal
      !terminal
    end
  end

  def recover_interrupted!(now: Time.current)
    with_lock do
      return false unless status == "processing" && lease_expires_at.present? && lease_expires_at <= now

      terminal = attempt_count >= MAX_ATTEMPTS
      update!(
        status: terminal ? "action_required" : "failed",
        last_error: "Recovered expired account-deletion lease",
        processing_token: nil,
        lease_expires_at: nil,
        updated_at: now
      )
      Rails.logger.error("Account deletion #{id} requires operator action after an expired final lease") if terminal
    end
    true
  end

  def mark_action_required!
    with_lock do
      return false unless status.in?(%w[pending failed]) && attempt_count >= MAX_ATTEMPTS

      update!(status: "action_required", last_error: last_error.presence || "Maximum account-deletion attempts reached")
      Rails.logger.error("Account deletion #{id} requires operator action after #{attempt_count} attempts")
    end
    true
  end

  def complete!(processing_token:)
    self.class.transaction do
      user_record = User.lock.find_by(id: user_id)
      deletion = self.class.lock.find(id)
      return true if deletion.completed?
      return false unless deletion.send(:owns_processing_token?, processing_token)
      raise ActiveRecord::RecordInvalid.new(deletion) unless deletion.provider_deleted?

      if user_record && deletion.user_id == user_record.id
        deletion.send(:anonymize_audit_events!, user_record)
        deletion.update!(user: nil)
        user_record.destroy!
      end

      deletion.update!(
        status: "completed",
        clerk_id: nil,
        completed_at: Time.current,
        last_error: nil,
        processing_token: nil,
        lease_expires_at: nil
      )
    end
    reload
    true
  end

  private

  def owned_processing_scope(processing_token)
    self.class.where(id: id, status: "processing", processing_token: processing_token)
  end

  def owns_processing_token?(processing_token)
    processing_token.present? && status == "processing" && self.processing_token == processing_token
  end

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
      target_id: nil,
      target_label: "Deleted account",
      metadata: {},
      field_changes: {},
      ip_address: nil,
      user_agent: nil,
      updated_at: anonymized_at
    )
  end
end
