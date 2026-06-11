class AddProfileAndArchiveFieldsToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :phone, :string
    add_column :users, :preferred_contact_method, :string
    add_column :users, :archived_at, :datetime
    add_reference :users, :archived_by, foreign_key: { to_table: :users }

    add_index :users, :archived_at
  end
end
