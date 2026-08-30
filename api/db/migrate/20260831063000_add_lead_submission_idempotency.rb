class AddLeadSubmissionIdempotency < ActiveRecord::Migration[8.1]
  def change
    add_column :leads, :idempotency_key, :string
    add_column :leads, :idempotency_fingerprint, :string
    add_index :leads, [ :brokerage_id, :idempotency_key ], unique: true, where: "idempotency_key IS NOT NULL", name: "index_leads_on_brokerage_and_idempotency_key"
  end
end
