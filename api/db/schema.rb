# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_05_18_115427) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "data_sync_runs", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "error_count"
    t.datetime "finished_at"
    t.integer "imported_count"
    t.integer "inactive_count"
    t.text "notes"
    t.string "provider"
    t.datetime "started_at"
    t.string "status"
    t.datetime "updated_at", null: false
    t.integer "updated_count"
  end

  create_table "features", force: :cascade do |t|
    t.string "category"
    t.datetime "created_at", null: false
    t.string "name"
    t.string "slug"
    t.datetime "updated_at", null: false
    t.index ["slug"], name: "index_features_on_slug", unique: true
  end

  create_table "leads", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "email"
    t.string "lead_type"
    t.bigint "listing_id"
    t.text "message"
    t.string "name"
    t.string "phone"
    t.string "preferred_contact_method"
    t.string "preferred_time"
    t.date "preferred_tour_date"
    t.string "status"
    t.decimal "target_price"
    t.string "tour_type"
    t.datetime "updated_at", null: false
    t.index ["created_at"], name: "index_leads_on_created_at"
    t.index ["listing_id"], name: "index_leads_on_listing_id"
    t.index ["status"], name: "index_leads_on_status"
  end

  create_table "listing_features", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "feature_id", null: false
    t.bigint "listing_id", null: false
    t.datetime "updated_at", null: false
    t.index ["feature_id"], name: "index_listing_features_on_feature_id"
    t.index ["listing_id", "feature_id"], name: "index_listing_features_on_listing_id_and_feature_id", unique: true
    t.index ["listing_id"], name: "index_listing_features_on_listing_id"
  end

  create_table "listing_photos", force: :cascade do |t|
    t.string "alt_text"
    t.datetime "created_at", null: false
    t.bigint "listing_id", null: false
    t.integer "position"
    t.datetime "updated_at", null: false
    t.string "url"
    t.index ["listing_id"], name: "index_listing_photos_on_listing_id"
  end

  create_table "listings", force: :cascade do |t|
    t.string "address"
    t.string "agent_name"
    t.decimal "baths"
    t.integer "beds"
    t.string "brokerage_name"
    t.datetime "created_at", null: false
    t.text "description"
    t.string "external_id"
    t.decimal "latitude"
    t.string "listing_kind"
    t.decimal "longitude"
    t.integer "lot_square_feet"
    t.decimal "price"
    t.string "property_type"
    t.datetime "published_at"
    t.string "source"
    t.datetime "source_updated_at"
    t.integer "square_feet"
    t.string "status"
    t.string "title"
    t.datetime "updated_at", null: false
    t.bigint "village_id", null: false
    t.integer "year_built"
    t.index ["beds"], name: "index_listings_on_beds"
    t.index ["latitude", "longitude"], name: "index_listings_on_latitude_and_longitude"
    t.index ["listing_kind"], name: "index_listings_on_listing_kind"
    t.index ["price"], name: "index_listings_on_price"
    t.index ["property_type"], name: "index_listings_on_property_type"
    t.index ["source", "external_id"], name: "index_listings_on_source_and_external_id", unique: true
    t.index ["status"], name: "index_listings_on_status"
    t.index ["village_id"], name: "index_listings_on_village_id"
  end

  create_table "saved_listings", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "email"
    t.bigint "listing_id", null: false
    t.datetime "updated_at", null: false
    t.index ["listing_id"], name: "index_saved_listings_on_listing_id"
  end

  create_table "saved_searches", force: :cascade do |t|
    t.string "alert_frequency"
    t.datetime "created_at", null: false
    t.string "email"
    t.jsonb "filters"
    t.string "name"
    t.datetime "updated_at", null: false
  end

  create_table "villages", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "description"
    t.decimal "latitude"
    t.decimal "longitude"
    t.string "name"
    t.string "region"
    t.string "slug"
    t.datetime "updated_at", null: false
    t.index ["slug"], name: "index_villages_on_slug", unique: true
  end

  add_foreign_key "leads", "listings"
  add_foreign_key "listing_features", "features"
  add_foreign_key "listing_features", "listings"
  add_foreign_key "listing_photos", "listings"
  add_foreign_key "listings", "villages"
  add_foreign_key "saved_listings", "listings"
end
