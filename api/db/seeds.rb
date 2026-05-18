puts "Seeding Hafa Homes demo data..."

ListingFeature.delete_all
ListingPhoto.delete_all
SavedListing.delete_all
SavedSearch.delete_all
Lead.delete_all
Listing.delete_all
Feature.delete_all
Village.delete_all
DataSyncRun.delete_all

villages = [
  ["Tamuning", "tamuning", "Central", "Central Guam living near shopping, beaches, hospitals, and major business corridors.", 13.4877, 144.7814],
  ["Tumon", "tumon", "Central", "Guam's resort district with beach access, dining, hotels, condos, and investment properties.", 13.5097, 144.8021],
  ["Dededo", "dededo", "North", "A popular northern village with many homes, rentals, schools, and access toward Andersen AFB.", 13.5178, 144.8391],
  ["Yigo", "yigo", "North", "Northern Guam village close to Andersen AFB with newer subdivisions and larger lots.", 13.5361, 144.8885],
  ["Mangilao", "mangilao", "Central", "Central-east village near schools, university areas, and cross-island routes.", 13.4476, 144.8005],
  ["Barrigada", "barrigada", "Central", "Convenient central village near the airport, schools, and major commuter routes.", 13.4706, 144.7990],
  ["Talofofo", "talofofo", "South", "Southern Guam living with quieter neighborhoods, larger lots, and scenic coastal access.", 13.3548, 144.7554]
].to_h do |name, slug, region, description, latitude, longitude|
  village = Village.create!(name:, slug:, region:, description:, latitude:, longitude:)
  [slug, village]
end

features = [
  ["Pet Friendly", "pet-friendly", "Rental"],
  ["Furnished", "furnished", "Rental"],
  ["Ocean View", "ocean-view", "Lifestyle"],
  ["Generator", "generator", "Island Ready"],
  ["Water Tank", "water-tank", "Island Ready"],
  ["Typhoon Shutters", "typhoon-shutters", "Island Ready"],
  ["Split AC", "split-ac", "Comfort"],
  ["Fenced Yard", "fenced-yard", "Lifestyle"],
  ["Gated Community", "gated-community", "Security"],
  ["Pool", "pool", "Lifestyle"],
  ["Near Andersen AFB", "near-andersen-afb", "Military"],
  ["Near Naval Base Guam", "near-naval-base-guam", "Military"],
  ["Near Camp Blaz", "near-camp-blaz", "Military"],
  ["OHA Friendly", "oha-friendly", "Military"]
].to_h do |name, slug, category|
  feature = Feature.create!(name:, slug:, category:)
  [slug, feature]
end

sample_photo_sets = [
  [
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1400&q=80"
  ],
  [
    "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=80"
  ],
  [
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1400&q=80"
  ]
]

listings_data = [
  {
    external_id: "DEMO-26-1001",
    listing_kind: "sale",
    property_type: "home",
    title: "Modern Yigo home close to Andersen AFB",
    address: "Demo Street, Yigo, Guam 96929",
    village: villages["yigo"],
    price: 588_000,
    beds: 3,
    baths: 2.5,
    square_feet: 1850,
    lot_square_feet: 7200,
    year_built: 2025,
    latitude: 13.5369,
    longitude: 144.8890,
    description: "Demo listing for a modern northern Guam home with fenced yard, split AC, and island-ready features near Andersen AFB.",
    feature_slugs: ["near-andersen-afb", "split-ac", "fenced-yard", "typhoon-shutters", "water-tank"]
  },
  {
    external_id: "DEMO-26-1002",
    listing_kind: "rent",
    property_type: "condo",
    title: "Furnished Tumon condo with ocean views",
    address: "Demo Condo Lane, Tumon, Guam 96913",
    village: villages["tumon"],
    price: 2800,
    beds: 2,
    baths: 2,
    square_feet: 1200,
    year_built: 2018,
    latitude: 13.5104,
    longitude: 144.8040,
    description: "Demo rental condo in Tumon with resort-area convenience, ocean views, and furnished move-in ready setup.",
    feature_slugs: ["furnished", "ocean-view", "pool", "split-ac", "oha-friendly"]
  },
  {
    external_id: "DEMO-26-1003",
    listing_kind: "rent",
    property_type: "home",
    title: "Pet-friendly Dededo rental with fenced yard",
    address: "Demo Court, Dededo, Guam 96929",
    village: villages["dededo"],
    price: 2450,
    beds: 3,
    baths: 2,
    square_feet: 1600,
    year_built: 2014,
    latitude: 13.5190,
    longitude: 144.8401,
    description: "Demo rental built around what relocating families ask for: pet-friendly policy, fenced yard, split AC, and northern access.",
    feature_slugs: ["pet-friendly", "fenced-yard", "split-ac", "near-andersen-afb", "oha-friendly"]
  },
  {
    external_id: "DEMO-26-1004",
    listing_kind: "sale",
    property_type: "condo",
    title: "Central Tamuning condo near shopping and hospital",
    address: "Demo Condo Road, Tamuning, Guam 96913",
    village: villages["tamuning"],
    price: 450_000,
    beds: 2,
    baths: 2,
    square_feet: 1050,
    year_built: 2009,
    latitude: 13.4882,
    longitude: 144.7825,
    description: "Demo centrally located condo for buyers who want convenience, low-maintenance living, and quick access across Guam.",
    feature_slugs: ["split-ac", "gated-community", "pool"]
  },
  {
    external_id: "DEMO-26-1005",
    listing_kind: "sale",
    property_type: "home",
    title: "Talofofo island home with room to breathe",
    address: "Demo Heights, Talofofo, Guam 96915",
    village: villages["talofofo"],
    price: 658_000,
    beds: 4,
    baths: 3,
    square_feet: 2300,
    lot_square_feet: 11000,
    year_built: 2026,
    latitude: 13.3553,
    longitude: 144.7560,
    description: "Demo southern Guam home with generous space, island-ready systems, and a quieter lifestyle.",
    feature_slugs: ["generator", "water-tank", "typhoon-shutters", "split-ac", "fenced-yard"]
  }
]

listings_data.each_with_index do |data, index|
  feature_slugs = data.delete(:feature_slugs)
  listing = Listing.create!(
    data.merge(
      source: "demo",
      status: "active",
      agent_name: "Hafa Homes Demo Team",
      brokerage_name: "Demo Brokerage",
      published_at: index.days.ago,
      source_updated_at: Time.current
    )
  )

  sample_photo_sets[index % sample_photo_sets.length].each_with_index do |url, photo_index|
    listing.listing_photos.create!(url:, position: photo_index + 1, alt_text: listing.title)
  end

  feature_slugs.each do |slug|
    listing.features << features.fetch(slug)
  end
end

DataSyncRun.create!(
  provider: "Demo MLS Adapter",
  status: "completed",
  started_at: 2.hours.ago,
  finished_at: 2.hours.ago + 18.seconds,
  imported_count: Listing.count,
  updated_count: 0,
  inactive_count: 0,
  error_count: 0,
  notes: "Seeded demo data. Replace with authorized MLS/IDX/API feed when access is confirmed."
)

puts "Seeded #{Village.count} villages, #{Feature.count} features, #{Listing.count} listings."
