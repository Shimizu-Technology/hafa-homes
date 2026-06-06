class AddUserLinksToSavedListingsAndLeads < ActiveRecord::Migration[8.1]
  def change
    add_reference :saved_listings, :user, foreign_key: true
    add_index :saved_listings, [:user_id, :listing_id], unique: true, where: "user_id IS NOT NULL", name: "index_saved_listings_on_user_and_listing"

    add_reference :leads, :user, foreign_key: true
    add_index :leads, [:user_id, :created_at]
  end
end
