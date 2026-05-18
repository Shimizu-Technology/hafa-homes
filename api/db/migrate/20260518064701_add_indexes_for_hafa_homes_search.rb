class AddIndexesForHafaHomesSearch < ActiveRecord::Migration[8.1]
  def change
    add_index :villages, :slug, unique: true
    add_index :features, :slug, unique: true
    add_index :listings, [:source, :external_id], unique: true
    add_index :listings, :status
    add_index :listings, :listing_kind
    add_index :listings, :property_type
    add_index :listings, :price
    add_index :listings, :beds
    add_index :listings, [:latitude, :longitude]
    add_index :listing_features, [:listing_id, :feature_id], unique: true
    add_index :leads, :status
    add_index :leads, :created_at
  end
end
