class BackfillVillageLocalIntel < ActiveRecord::Migration[8.1]
  LOCAL_INTEL = {
    "tamuning" => {
      summary: "Central, high-convenience living near hospitals, beaches, shopping, restaurants, and major work corridors.",
      lifestyle_tags: ["Central", "Beach access", "Shopping", "Medical access", "Condos"],
      schools_note: "Nearby public schools commonly associated with the Tamuning/Tumon area include Chief Brodie Memorial Elementary, Tamuning Elementary, Untalan Middle, and John F. Kennedy High. Always verify attendance areas with GDOE.",
      nearby_schools: ["Chief Brodie Memorial Elementary", "Tamuning Elementary", "Untalan Middle School", "John F. Kennedy High School"],
      parks_and_recreation: ["Ypao Beach Park / Governor Joseph Flores Memorial Park", "Matapang Beach Park", "Tumon Bay beaches"],
      daily_life: ["Guam Memorial Hospital area", "Guam Premier Outlets", "Tumon dining and hotel district", "Airport and business corridors"],
      commute_notes: ["Central location with quick access to Tumon, Hagatna, Barrigada, and the airport."],
      source_notes: ["Village list and tourism context from Guam Visitors Bureau; school names should be verified with GDOE attendance guidance before production use."]
    },
    "tumon" => {
      summary: "Guam's resort district with beach access, condos, hotels, restaurants, nightlife, and short drives to central services.",
      lifestyle_tags: ["Resort district", "Beach", "Condos", "Dining", "Investment"],
      schools_note: "Tumon is commonly served by nearby Tamuning-area public schools; verify current attendance areas with GDOE.",
      nearby_schools: ["Chief Brodie Memorial Elementary", "Tamuning Elementary", "Untalan Middle School", "John F. Kennedy High School"],
      parks_and_recreation: ["Tumon Beach", "Ypao Beach Park", "Matapang Beach Park", "Two Lovers Point nearby"],
      daily_life: ["Hotel Road dining", "Luxury and outlet shopping", "Tour operators and beach activities", "Central medical and airport access"],
      commute_notes: ["Best for buyers/renters who value walkable resort amenities and central-north access."],
      source_notes: ["Guam Visitors Bureau identifies Tumon as the resort/tourism district; school boundaries require GDOE verification."]
    },
    "dededo" => {
      summary: "Guam's largest northern village, popular for housing inventory, shopping, schools, and access toward Andersen AFB and Camp Blaz.",
      lifestyle_tags: ["North", "Family housing", "Shopping", "Military commute", "High inventory"],
      schools_note: "Dededo has multiple public elementary/middle schools and Okkodo High. Verify exact school assignment with GDOE.",
      nearby_schools: ["Astumbo Elementary", "Astumbo Middle School", "Finegayan Elementary", "Liguan Elementary", "Maria A. Ulloa Elementary", "Wettengel Elementary", "Okkodo High School"],
      parks_and_recreation: ["Dededo Sports Complex", "Astumbo community areas", "Northern beach and trail access by drive"],
      daily_life: ["Micronesia Mall", "Dededo Flea Market", "Guam Regional Medical City nearby", "Northern grocery and retail corridors"],
      commute_notes: ["Popular north-island base commute area for Andersen AFB and Camp Blaz; drive times vary heavily by route and traffic."],
      source_notes: ["Guam Visitors Bureau describes Dededo as Guam's most populous village; nearby school lists should be verified with GDOE."]
    },
    "yigo" => {
      summary: "Northern Guam village known for Andersen AFB proximity, larger lots, quieter subdivisions, and north-island routes.",
      lifestyle_tags: ["North", "Andersen AFB", "Larger lots", "Quiet", "Military commute"],
      schools_note: "Yigo-area public schools include northern elementary schools, F.B. Leon Guerrero Middle, and Simon Sanchez High; verify with GDOE.",
      nearby_schools: ["Daniel L. Perez Elementary", "Machananao Elementary", "Upi Elementary", "F.B. Leon Guerrero Middle School", "Simon Sanchez High School"],
      parks_and_recreation: ["Yigo gym/community recreation", "Mount Santa Rosa area", "Ritidian/northern coastline by drive"],
      daily_life: ["Andersen AFB access", "Northern grocery and service corridors", "Short drive to Dededo shopping"],
      commute_notes: ["Strong fit for households prioritizing Andersen AFB or north-island living over daily central/southern commutes."],
      source_notes: ["Village and tourism context from Guam Visitors Bureau; school assignment requires GDOE verification."]
    },
    "mangilao" => {
      summary: "Central-east village anchored by University of Guam, Guam Community College, schools, golf, and cross-island access.",
      lifestyle_tags: ["Central-east", "University", "Schools", "Golf", "Cross-island routes"],
      schools_note: "Mangilao-area schools and nearby education anchors include UOG, GCC, Agueda Johnston Middle, George Washington High, and area elementary schools. Verify assignment with GDOE.",
      nearby_schools: ["University of Guam", "Guam Community College", "Agueda Johnston Middle School", "George Washington High School", "Adacao Elementary"],
      parks_and_recreation: ["University/golf course area", "Pago Bay lookout and east-side drives", "Community sports facilities"],
      daily_life: ["UOG and GCC", "Mangilao/Barrigada services", "Central-east restaurants and small businesses"],
      commute_notes: ["Good central-east base for UOG/GCC, Barrigada, Chalan Pago-Ordot, and cross-island travel."],
      source_notes: ["Education anchors are public institutions; school attendance areas should be verified with GDOE."]
    },
    "barrigada" => {
      summary: "Central village with fast access to the airport, Route 8/10/16 corridors, schools, and military facilities around Barrigada/NCTS.",
      lifestyle_tags: ["Central", "Airport access", "Commute hub", "Schools", "Military access"],
      schools_note: "Barrigada-area schools include B.P. Carbullido Elementary, Luis P. Untalan Middle, and Tiyan High nearby. Verify current assignment with GDOE.",
      nearby_schools: ["B.P. Carbullido Elementary", "Luis P. Untalan Middle School", "Tiyan High School"],
      parks_and_recreation: ["Barrigada community recreation", "Tiyan sports and open areas", "Central access to beaches by drive"],
      daily_life: ["Antonio B. Won Pat International Airport", "Route 8/10/16 corridors", "Central grocery and business access", "Barrigada/NCTS military area"],
      commute_notes: ["One of Guam's most practical commute bases for households splitting time between north, central, and Hagatna/Tamuning."],
      source_notes: ["Central commute positioning based on village geography; school assignment requires GDOE verification."]
    },
    "talofofo" => {
      summary: "Southern village with quieter residential areas, larger lots, scenic drives, golf, waterfalls, and rural/coastal access.",
      lifestyle_tags: ["South", "Quiet", "Larger lots", "Scenic", "Outdoor"],
      schools_note: "Southern school assignments vary; nearby public school options may include Talofofo Elementary and southern middle/high schools. Verify with GDOE.",
      nearby_schools: ["Talofofo Elementary", "Inarajan Middle School", "Southern High School"],
      parks_and_recreation: ["Talofofo Falls area", "Onward Talofofo Golf Club area", "Ipan/Talofofo Bay coastal access", "Southern scenic drives"],
      daily_life: ["Village stores and southern services", "Golf/outdoor recreation", "Longer drives to central job and shopping corridors"],
      commute_notes: ["Best for buyers/renters prioritizing privacy, land, and south-island lifestyle over short central commutes."],
      source_notes: ["Tourism/recreation references should be verified against current operators and public access status before production use."]
    }
  }.freeze

  def up
    LOCAL_INTEL.each do |slug, intel|
      execute <<~SQL.squish
        UPDATE villages
        SET local_intel = #{connection.quote(intel.to_json)}::jsonb
        WHERE slug = #{connection.quote(slug)}
      SQL
    end
  end

  def down
    execute "UPDATE villages SET local_intel = '{}'::jsonb"
  end
end
