# Hafa Homes Local Intel Plan

_Last updated: 2026-05-26._

## Why this matters

Mike's feedback pointed toward a feature that answers the practical buyer/renter question:

> What is actually around this home?

This is one of the clearest ways Hafa Homes can be more useful than a generic MLS/IDX wrapper. National portals can show price, beds, baths, and a map pin. Hafa Homes should explain Guam-specific context: village lifestyle, school considerations, base commute, parks/beaches, daily errands, and nearby things to do.

## Research baseline

Initial Phase 1 data is curated from public Guam context and should be treated as helpful local guidance, not official assignment or legal/compliance data.

Sources consulted:

- Guam Visitors Bureau village pages and things-to-do/beach content: `visitguam.com/about-guam/villages/`, village-specific pages, and `visitguam.com/things-to-do/`
- Guam Department of Education public site/directory surface: `gdoe.net`
- Existing Hafa Homes product docs and Mike meeting notes:
  - `docs/product/product-brief.md`
  - `docs/product/platform-strategy.md`
  - `Brain-Dump/work/shimizu-tech/Michael Sazaki (BOH)/2) Talk with Mike about HafaHomes and Shimizu Technology - May 24, 2026.md`

Important caveat: school attendance areas, public access, business availability, and commute times can change. The app should say “nearby schools” or “commonly associated schools” until we have official, verified attendance-zone data.

## Phase 1: curated village intel

Phase 1 stores a curated `local_intel` JSON object on each village and displays it on mobile listing detail pages.

Fields:

- `summary`
- `lifestyle_tags`
- `schools_note`
- `nearby_schools`
- `parks_and_recreation`
- `daily_life`
- `commute_notes`
- `source_notes`

Current seeded villages:

- Tamuning
- Tumon
- Dededo
- Yigo
- Mangilao
- Barrigada
- Talofofo

Phase 1 UI should appear as “Local Intel” or “Around this home” on listing detail pages.

## Phase 2: coordinate-aware nearby data

Once listing coordinates and amenity datasets are reliable, move from village-level guidance to distance-based context.

Recommended data model:

- `amenities` table:
  - name
  - category: school, park, beach, grocery, clinic, restaurant, base, attraction, sports, shopping
  - latitude/longitude
  - village_id optional
  - source
  - verification status
- listing detail API includes nearby amenities by radius/category.
- mobile renders “near this home” lists with approximate drive/distance.

Phase 2 behavior:

- schools within X miles, clearly labeled as nearby not assigned
- parks/beaches within X miles
- grocery/medical/shopping nearby
- base/commute anchors with approximate distance
- map overlays for selected amenity category

Potential data sources to evaluate:

- manually curated seed data for highest-value Guam amenities
- OpenStreetMap / Overpass for parks, schools, beaches, groceries
- Google Places API if licensing/cost allows
- official Guam/GDOE data where available

## Phase 3: village guide / neighborhood pages

Build local guide pages that can serve both app users and SEO/web visitors.

Each village guide can include:

- overview / “living in…” summary
- lifestyle tags
- active listings
- rental availability
- schools and education notes
- parks, beaches, and things to do
- commute to Andersen AFB, Naval Base Guam, Camp Blaz, airport, Hagatna, Tumon
- market snapshot
- agent/broker commentary
- relocation notes

This becomes a core differentiator and sales asset for brokerages/agents.

## Product copy rules

Use careful language:

- Say “nearby schools” unless official attendance zones are verified.
- Add “verify school assignments with GDOE” disclaimer.
- Avoid guaranteeing commute times; phrase as guidance.
- Clearly distinguish public parks/beaches from private/commercial attractions.
- Avoid implying MLS/compliance claims until real feed rules are known.

## Next implementation ideas

1. Add the Phase 1 mobile listing-detail Local Intel section.
2. Add village guide cards under the mobile More tab.
3. Add web village detail sections using the same `local_intel` API data.
4. Build a small curated amenity seed file for Phase 2.
5. Add distance calculations once amenity coordinates are available.
