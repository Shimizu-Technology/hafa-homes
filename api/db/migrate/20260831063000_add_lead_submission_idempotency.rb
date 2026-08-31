class AddLeadSubmissionIdempotency < ActiveRecord::Migration[8.1]
  def change
    add_column :leads, :idempotency_key, :string
    add_column :leads, :idempotency_fingerprint, :string
  end
end
