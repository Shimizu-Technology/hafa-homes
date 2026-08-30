class CreateAccountDeletions < ActiveRecord::Migration[8.1]
  def change
    create_table :account_deletions do |t|
      t.references :user, null: true, foreign_key: { on_delete: :nullify }
      t.string :clerk_id
      t.string :clerk_id_digest, null: false
      t.string :status, null: false, default: "pending"
      t.integer :attempt_count, null: false, default: 0
      t.datetime :requested_at, null: false
      t.datetime :last_attempt_at
      t.datetime :provider_deleted_at
      t.datetime :completed_at
      t.text :last_error
      t.timestamps

      t.index :clerk_id_digest, unique: true
      t.index [ :status, :updated_at ]
    end
  end
end
