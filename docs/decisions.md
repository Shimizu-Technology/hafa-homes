# Decisions

## 1. Product name: Hafa Homes

Decision: Use **Hafa Homes** as the working product name.

Reasoning:

- Local and Guam-specific
- Friendly and memorable
- Clearly related to housing
- Broad enough for buying, renting, selling, and relocation
- More distinctive than generic names like Guam MLS Search

Target domain: `HafaHomes.com`

## 2. Build PWA first

Decision: Start with a mobile-first PWA/web app instead of native iOS/Android.

Reasoning:

- Faster to build and demo
- Easier to share with Mike/investor via link
- No App Store/TestFlight friction
- Easier to iterate while MLS access is being figured out
- Good enough for search, maps, favorites, lead capture, and alerts
- Can later be packaged into iOS/Android using Capacitor or rebuilt native if traction justifies it

Native app decision is deferred until after demo validation and data access clarity. However, native iOS/Android app presence is now recognized as a possible sales differentiator because brokerages may already have websites and IDX pages.

## 3. Build demo before MLS is finalized

Decision: Do not wait for MLS access to build the demo.

Reasoning:

- Mike explicitly asked for a demo while he investigates MLS integration
- Demo can use sample/seed Guam listing data
- Product value can be shown before data contracts are finalized
- MLS access is a business/legal dependency, not a blocker for product design

## 4. Positioning: Guam-first, not Zillow clone

Decision: Do not pitch Hafa Homes as “Zillow for Guam.”

Preferred positioning:

> A Guam-first housing platform built around how people actually search for homes on island.

Reasoning:

- Zillow/Redfin/Realtor.com are already strong generic search brands
- Hafa Homes can win through local specificity
- Guam has unique rental, military, typhoon, village, commute, and property management needs

## 5. Primary wedge: local filters + military/rental workflows

Decision: Lean into Guam-specific filters and workflows.

Examples:

- Near Andersen AFB
- Near Naval Base Guam
- Near Camp Blaz
- Near Naval Hospital
- Pet friendly
- Furnished
- OHA/military-friendly
- Generator
- Water tank
- Typhoon shutters
- Split AC
- Fenced yard
- Ocean view
- Village/region search

## 6. MLS/data integration approach

Decision: Architect for an authorized MLS/IDX/API feed, but keep the demo feed-agnostic.

Possible data sources:

- Direct Guam MLS/IDX feed
- Brokerage-authorized IDX feed
- Investor/brokerage-provided API/export
- CSV import
- Manual admin entry for MVP/demo

The app should include a sync layer later that can normalize imported listings into Hafa Homes' internal listing model.

## 7. Platform model: Hafa Homes as broker/agent marketplace

Decision: Keep Hafa Homes as the consumer-facing Guam real estate brand while designing the backend to support brokerages and agents as subscribers/participants.

Working model:

> Brokerages and agents subscribe to Hafa Homes, connect or authorize their MLS/listing feed, publish their listings/agents, and receive leads through the platform.

Reasoning:

- Mike is leaning toward a Locations LLC-style platform rather than a single-brokerage website.
- Brokerages may already have websites; the app, mobile UX, lead capture, and consumer distribution are the value.
- Guam brokers use Flexmls, so Hafa Homes should be ready for authorized Flexmls/IDX/vendor integration.
- Marketplace architecture can still support brokerage-specific branding or white-label variants later.

Implications:

- Add brokerage and agent/realtor concepts.
- Associate listings with brokerage and listing agent.
- Route leads to the correct listing agent/brokerage.
- Track feed/source ownership and MLS attribution.
- Keep compliance flexible until Flexmls/MLS rules are confirmed.
