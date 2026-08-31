class AddLeadSubmissionIdempotencyIndex < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def change
    add_index :leads,
      [ :brokerage_id, :idempotency_key ],
      unique: true,
      where: "idempotency_key IS NOT NULL",
      algorithm: :concurrently,
      if_not_exists: true,
      name: "index_leads_on_brokerage_and_idempotency_key"
  end
end
