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
  ],
  [
    "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1600563438938-a9a27216b4f5?auto=format&fit=crop&w=1400&q=80"
  ],
  [
    "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1600210492493-0946911123ea?auto=format&fit=crop&w=1400&q=80"
  ],
  [
    "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1600573472592-401b489a3cdc?auto=format&fit=crop&w=1400&q=80"
  ],
  [
    "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1400&q=80"
  ],
  [
    "https://images.unsplash.com/photo-1600566753151-384129cf4e3e?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1600607688960-e095ff83135c?auto=format&fit=crop&w=1400&q=80"
  ],
  [
    "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1600585152915-d208bec867a1?auto=format&fit=crop&w=1400&q=80"
  ],
  [
    "https://images.unsplash.com/photo-1600607688066-890987f18a86?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=1400&q=80"
  ]
]

# Public listing facts were sampled from GuamRealtyFinder pages on May 18, 2026
# to make the demo feel grounded in the Guam market. Photos are intentionally
# generic stock/Unsplash images rather than copied listing photos.
listings_data = [
  {
    external_id: "MLS-26-1071",
    listing_kind: "sale",
    property_type: "home",
    title: "Large northern Yigo home near Andersen",
    address: "130 Charles Flores, Yigo, Guam 96929",
    village: villages["yigo"],
    price: 775_000,
    beds: 6,
    baths: 4.5,
    square_feet: 3400,
    lot_square_feet: 9200,
    year_built: 2018,
    latitude: 13.5386,
    longitude: 144.8878,
    description: "Spacious Yigo home profile with multiple suites, split AC, and convenient access toward Andersen AFB and northern services.",
    feature_slugs: ["near-andersen-afb", "split-ac", "fenced-yard", "water-tank", "typhoon-shutters"]
  },
  {
    external_id: "MLS-25-4885",
    listing_kind: "sale",
    property_type: "home",
    title: "Chopac Court Yigo home with generous bedrooms",
    address: "133 Chopac Court, Yigo, Guam 96929",
    village: villages["yigo"],
    price: 750_000,
    beds: 4,
    baths: 4.5,
    square_feet: 2769,
    lot_square_feet: 7800,
    year_built: 2020,
    latitude: 13.5359,
    longitude: 144.8912,
    description: "Northern Guam home profile with a flexible bedroom layout, island-ready systems, and practical commute access.",
    feature_slugs: ["near-andersen-afb", "split-ac", "fenced-yard", "generator"]
  },
  {
    external_id: "MLS-26-1049",
    listing_kind: "sale",
    property_type: "home",
    title: "Lafac Street Yigo home with modern layout",
    address: "242 Lafac Street, Yigo, Guam 96929",
    village: villages["yigo"],
    price: 750_000,
    beds: 4,
    baths: 3.5,
    square_feet: 2326,
    lot_square_feet: 7200,
    year_built: 2024,
    latitude: 13.5339,
    longitude: 144.8845,
    description: "Newer Yigo home profile with open living space, split AC, and a north-island location popular with military households.",
    feature_slugs: ["near-andersen-afb", "split-ac", "typhoon-shutters", "water-tank"]
  },
  {
    external_id: "MLS-26-755",
    listing_kind: "sale",
    property_type: "multi-family",
    title: "Liguan Avenue income property in Dededo",
    address: "126 East Liguan Avenue, Dededo, Guam 96929",
    village: villages["dededo"],
    price: 1_600_000,
    beds: 15,
    baths: 8,
    square_feet: 6000,
    lot_square_feet: 14500,
    year_built: 2008,
    latitude: 13.5208,
    longitude: 144.8388,
    description: "Large Dededo multiplex profile for investors looking for northern Guam rental demand and multi-unit scale.",
    feature_slugs: ["near-andersen-afb", "split-ac", "fenced-yard"]
  },
  {
    external_id: "MLS-25-2826",
    listing_kind: "sale",
    property_type: "home",
    title: "Chalan Batanga Dededo residence",
    address: "138 Chalan Batanga, Dededo, Guam 96929",
    village: villages["dededo"],
    price: 1_050_000,
    beds: 4,
    baths: 4.5,
    square_feet: 4008,
    lot_square_feet: 9800,
    year_built: 2016,
    latitude: 13.5173,
    longitude: 144.8433,
    description: "Substantial Dededo home profile with large living areas, multiple baths, and quick access to northern shopping corridors.",
    feature_slugs: ["split-ac", "fenced-yard", "water-tank", "typhoon-shutters"]
  },
  {
    external_id: "MLS-26-1722",
    listing_kind: "sale",
    property_type: "home",
    title: "West San Antonio Drive Dededo home",
    address: "372 W San Antonio Drive, Dededo, Guam 96929",
    village: villages["dededo"],
    price: 850_000,
    beds: 6,
    baths: 5,
    square_feet: 1800,
    lot_square_feet: 6800,
    year_built: 2015,
    latitude: 13.5224,
    longitude: 144.8350,
    description: "Dededo home profile with a high bedroom count, useful for extended households or flexible work-from-home needs.",
    feature_slugs: ["near-andersen-afb", "split-ac", "fenced-yard"]
  },
  {
    external_id: "MLS-26-1254",
    listing_kind: "sale",
    property_type: "home",
    title: "Golondrina Avenue Barrigada estate profile",
    address: "113 Golondrina Avenue, Barrigada, Guam 96913",
    village: villages["barrigada"],
    price: 1_450_000,
    beds: 5,
    baths: 5,
    square_feet: 4579,
    lot_square_feet: 12000,
    year_built: 2017,
    latitude: 13.4718,
    longitude: 144.7971,
    description: "Central Barrigada home profile with estate-scale living area, quick cross-island access, and room for multi-generational living.",
    feature_slugs: ["split-ac", "generator", "water-tank", "typhoon-shutters", "fenced-yard"]
  },
  {
    external_id: "MLS-26-1564",
    listing_kind: "sale",
    property_type: "home",
    title: "Carinoso Avenue Barrigada home",
    address: "215 Carinoso Avenue, Barrigada, Guam 96913",
    village: villages["barrigada"],
    price: 835_000,
    beds: 4,
    baths: 4,
    square_feet: 2708,
    lot_square_feet: 7600,
    year_built: 2019,
    latitude: 13.4695,
    longitude: 144.8016,
    description: "Central Guam home profile with a practical four-bedroom layout and fast access toward airport, schools, and Route 8.",
    feature_slugs: ["split-ac", "fenced-yard", "water-tank"]
  },
  {
    external_id: "MLS-26-963",
    listing_kind: "sale",
    property_type: "home",
    title: "Bisita Lane Tumon home near resort district",
    address: "156 Bisita Lane, Tumon, Guam 96913",
    village: villages["tumon"],
    price: 1_550_000,
    beds: 2,
    baths: 2.5,
    square_feet: 2060,
    lot_square_feet: 5200,
    year_built: 2012,
    latitude: 13.5091,
    longitude: 144.8037,
    description: "Tumon home profile for buyers who want resort-district convenience, beach access, and a low-commute central lifestyle.",
    feature_slugs: ["ocean-view", "split-ac", "pool", "gated-community"]
  },
  {
    external_id: "MLS-26-1630",
    listing_kind: "sale",
    property_type: "condo",
    title: "Frank H Cushing Way Tumon condo",
    address: "301 Frank H Cushing Way, Tumon, Guam 96913",
    village: villages["tumon"],
    price: 1_150_000,
    beds: 3,
    baths: 2,
    square_feet: 2350,
    year_built: 2007,
    latitude: 13.5118,
    longitude: 144.8064,
    description: "Large Tumon condo profile with resort-area convenience, ocean-view potential, and lock-and-leave simplicity.",
    feature_slugs: ["ocean-view", "pool", "gated-community", "split-ac"]
  },
  {
    external_id: "MLS-26-1780",
    listing_kind: "sale",
    property_type: "condo",
    title: "San Vitores Tumon condo near beach corridor",
    address: "468 San Vitores Road, Tumon, Guam 96913",
    village: villages["tumon"],
    price: 825_000,
    beds: 3,
    baths: 2.5,
    square_feet: 1953,
    year_built: 2004,
    latitude: 13.5132,
    longitude: 144.8079,
    description: "Tumon condo profile near hotels, dining, and beach access with strong appeal for owner-occupants and investors.",
    feature_slugs: ["ocean-view", "pool", "split-ac", "gated-community"]
  },
  {
    external_id: "MLS-26-1293",
    listing_kind: "sale",
    property_type: "multi-family",
    title: "Ypao Road Tamuning multi-family property",
    address: "240 Ypao Road, Tamuning, Guam 96913",
    village: villages["tamuning"],
    price: 14_500_000,
    beds: 99,
    baths: 145,
    square_feet: 84514,
    lot_square_feet: 115000,
    year_built: 1998,
    latitude: 13.4891,
    longitude: 144.7861,
    description: "Large central Tamuning multi-family profile representing Guam's institutional-scale housing inventory near shopping and hospital corridors.",
    feature_slugs: ["split-ac", "gated-community", "pool"]
  },
  {
    external_id: "MLS-26-688",
    listing_kind: "sale",
    property_type: "home",
    title: "North Marine Corps Drive Tamuning residence",
    address: "999 North Marine Corps Drive, Tamuning, Guam 96913",
    village: villages["tamuning"],
    price: 2_680_000,
    beds: 5,
    baths: 5,
    square_feet: 6000,
    lot_square_feet: 16000,
    year_built: 2014,
    latitude: 13.4868,
    longitude: 144.7809,
    description: "Luxury Tamuning home profile with a central address, substantial square footage, and quick access to the island's main business corridor.",
    feature_slugs: ["ocean-view", "split-ac", "generator", "water-tank", "pool"]
  },
  {
    external_id: "MLS-25-4747",
    listing_kind: "sale",
    property_type: "condo",
    title: "Dungca Beachway Tamuning condo",
    address: "125 Dungca Beachway, Tamuning, Guam 96913",
    village: villages["tamuning"],
    price: 1_349_000,
    beds: 4,
    baths: 4,
    square_feet: 2283,
    year_built: 2010,
    latitude: 13.4904,
    longitude: 144.7846,
    description: "Tamuning condo profile close to beaches, shopping, and hospital access with a larger four-bedroom layout.",
    feature_slugs: ["ocean-view", "pool", "gated-community", "split-ac"]
  },
  {
    external_id: "MLS-25-2890",
    listing_kind: "sale",
    property_type: "home",
    title: "J Enrique San Nicolas Lane Talofofo estate",
    address: "225 J Enrique San Nicolas Lane, Talofofo, Guam 96915",
    village: villages["talofofo"],
    price: 1_575_000,
    beds: 4,
    baths: 4.5,
    square_feet: 6311,
    lot_square_feet: 32000,
    year_built: 2011,
    latitude: 13.3561,
    longitude: 144.7544,
    description: "Southern Guam estate profile with large interior space, quieter surroundings, and room for privacy or outdoor living.",
    feature_slugs: ["generator", "water-tank", "typhoon-shutters", "split-ac", "fenced-yard"]
  },
  {
    external_id: "MLS-26-482",
    listing_kind: "sale",
    property_type: "home",
    title: "Perez Heights Talofofo home",
    address: "196C Perez Heights, Talofofo, Guam 96915",
    village: villages["talofofo"],
    price: 720_000,
    beds: 4,
    baths: 3.5,
    square_feet: 2187,
    lot_square_feet: 10000,
    year_built: 2023,
    latitude: 13.3538,
    longitude: 144.7581,
    description: "Talofofo home profile with newer construction, southern island privacy, and the island-ready systems buyers ask about.",
    feature_slugs: ["generator", "water-tank", "split-ac", "fenced-yard"]
  },
  {
    external_id: "MLS-26-750",
    listing_kind: "rent",
    property_type: "home",
    title: "Father San Vitores Tamuning rental home",
    address: "240 Father San Vitores Street, Tamuning, Guam 96913",
    village: villages["tamuning"],
    price: 6000,
    beds: 4,
    baths: 3.5,
    square_feet: 2668,
    year_built: 2015,
    latitude: 13.4876,
    longitude: 144.7839,
    description: "Central Tamuning rental profile with furnished potential, strong access to shopping and beach corridors, and OHA-friendly positioning.",
    feature_slugs: ["oha-friendly", "split-ac", "fenced-yard", "furnished"]
  },
  {
    external_id: "MLS-26-1783",
    listing_kind: "rent",
    property_type: "condo",
    title: "Dungca Beach Tamuning condo rental",
    address: "125 Dungca Beach, Tamuning, Guam 96913",
    village: villages["tamuning"],
    price: 4500,
    beds: 4,
    baths: 4,
    square_feet: 2336,
    year_built: 2010,
    latitude: 13.4900,
    longitude: 144.7853,
    description: "Large Tamuning condo rental profile with beach-area convenience, pool amenities, and central access.",
    feature_slugs: ["oha-friendly", "ocean-view", "pool", "gated-community", "split-ac"]
  },
  {
    external_id: "MLS-26-557",
    listing_kind: "rent",
    property_type: "condo",
    title: "Tatuha Tasi Tumon condo rental",
    address: "Tatuha Tasi, Tumon, Guam 96913",
    village: villages["tumon"],
    price: 5800,
    beds: 3,
    baths: 3,
    square_feet: 1800,
    year_built: 2008,
    latitude: 13.5111,
    longitude: 144.8052,
    description: "Tumon rental condo profile with resort district access, ocean-view lifestyle, and move-in-ready convenience.",
    feature_slugs: ["furnished", "ocean-view", "pool", "oha-friendly", "split-ac"]
  },
  {
    external_id: "MLS-26-1813",
    listing_kind: "rent",
    property_type: "condo",
    title: "Chamorrita Way Tumon rental",
    address: "107 Chamorrita Way, Tumon, Guam 96913",
    village: villages["tumon"],
    price: 4800,
    beds: 3,
    baths: 2,
    square_feet: 1514,
    year_built: 2016,
    latitude: 13.5084,
    longitude: 144.8085,
    description: "Tumon condo rental profile near hotels, beach access, restaurants, and central Guam commute routes.",
    feature_slugs: ["furnished", "ocean-view", "pool", "split-ac"]
  },
  {
    external_id: "MLS-26-606",
    listing_kind: "rent",
    property_type: "home",
    title: "Papaya Lane Yigo rental near Andersen",
    address: "108 Papaya Lane, Yigo, Guam 96929",
    village: villages["yigo"],
    price: 6600,
    beds: 3,
    baths: 2.5,
    square_feet: 1739,
    year_built: 2022,
    latitude: 13.5371,
    longitude: 144.8898,
    description: "Yigo rental profile with north-island convenience and strong appeal for military households seeking Andersen access.",
    feature_slugs: ["near-andersen-afb", "oha-friendly", "split-ac", "fenced-yard"]
  },
  {
    external_id: "MLS-25-4009",
    listing_kind: "rent",
    property_type: "home",
    title: "Chalan Adams Yigo family rental",
    address: "130 Chalan Adams, Yigo, Guam 96929",
    village: villages["yigo"],
    price: 4500,
    beds: 4,
    baths: 3,
    square_feet: 2431,
    year_built: 2018,
    latitude: 13.5347,
    longitude: 144.8869,
    description: "Four-bedroom Yigo rental profile with practical space, split AC, and easy access to northern bases and shopping.",
    feature_slugs: ["near-andersen-afb", "oha-friendly", "split-ac", "water-tank"]
  },
  {
    external_id: "MLS-26-1516",
    listing_kind: "rent",
    property_type: "home",
    title: "Kayen Jose Untalan Dededo rental",
    address: "342 Kayen Jose Untalan, Dededo, Guam 96929",
    village: villages["dededo"],
    price: 4400,
    beds: 4,
    baths: 3,
    square_feet: 1850,
    year_built: 2019,
    latitude: 13.5197,
    longitude: 144.8415,
    description: "Dededo rental profile with four bedrooms, fenced-yard potential, and north-island commute convenience.",
    feature_slugs: ["pet-friendly", "fenced-yard", "near-andersen-afb", "oha-friendly", "split-ac"]
  },
  {
    external_id: "MLS-26-1478",
    listing_kind: "rent",
    property_type: "home",
    title: "Chalan Despaciu Dededo rental home",
    address: "124 Chalan Despaciu, Dededo, Guam 96929",
    village: villages["dededo"],
    price: 3500,
    beds: 3,
    baths: 2.5,
    square_feet: 1754,
    year_built: 2017,
    latitude: 13.5156,
    longitude: 144.8393,
    description: "Dededo rental profile sized for families or roommates with split AC and straightforward northern access.",
    feature_slugs: ["pet-friendly", "fenced-yard", "split-ac", "oha-friendly"]
  },
  {
    external_id: "MLS-26-1411",
    listing_kind: "rent",
    property_type: "home",
    title: "Corenoso Street Barrigada rental",
    address: "185 Corenoso Street, Barrigada, Guam 96913",
    village: villages["barrigada"],
    price: 4500,
    beds: 4,
    baths: 3,
    square_feet: 3765,
    year_built: 2012,
    latitude: 13.4722,
    longitude: 144.8021,
    description: "Large central Barrigada rental profile for households wanting space and cross-island commute flexibility.",
    feature_slugs: ["oha-friendly", "split-ac", "fenced-yard", "water-tank"]
  },
  {
    external_id: "MLS-26-1761",
    listing_kind: "rent",
    property_type: "townhouse",
    title: "Colina de Barrigada townhouse rental",
    address: "Adelfa Loop Colina de Barrigada, Barrigada, Guam 96913",
    village: villages["barrigada"],
    price: 3800,
    beds: 3,
    baths: 2.5,
    square_feet: 2310,
    year_built: 2011,
    latitude: 13.4688,
    longitude: 144.7988,
    description: "Barrigada townhouse rental profile with central convenience, gated-community feel, and practical floor plan.",
    feature_slugs: ["gated-community", "oha-friendly", "split-ac"]
  }
]

listings_data.each_with_index do |data, index|
  feature_slugs = data.delete(:feature_slugs)
  listing = Listing.create!(
    data.merge(
      source: "public_market_snapshot",
      status: "active",
      agent_name: "Contact listing brokerage",
      brokerage_name: "Public Guam market snapshot",
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
  provider: "Public Guam Market Snapshot",
  status: "completed",
  started_at: 2.hours.ago,
  finished_at: 2.hours.ago + 18.seconds,
  imported_count: Listing.count,
  updated_count: 0,
  inactive_count: 0,
  error_count: 0,
  notes: "Seeded from publicly visible Guam listing facts for demo only. Photos are generic stock placeholders; replace with authorized MLS/IDX/API media before production use."
)

puts "Seeded #{Village.count} villages, #{Feature.count} features, #{Listing.count} listings."
