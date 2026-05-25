# Hafa Homes Platform Strategy

_Last updated: 2026-05-24 after Leon/Mike Hafa Homes discussion._

## Current direction

Hafa Homes is evolving from a proof-of-concept search demo into a potential Guam-wide real estate app/platform.

The working strategy is:

> Hafa Homes is the consumer-facing Guam real estate app. Brokerages and agents subscribe to participate, connect or authorize their MLS/listing feed, publish their listings/agents, and receive leads through the platform.

This is closer to a Guam-first Locations LLC-style platform than a one-off website for a single brokerage.

## Why this is valuable

Existing broker websites may already have MLS/IDX search, but they often feel like standard website integrations rather than a polished app experience.

Hafa Homes should compete on:

- app-first mobile UX
- map-first search
- Guam-specific filters and content
- agent/broker lead generation
- saved listings and saved searches
- direct showing/contact flows
- neighborhood guidance
- mortgage/affordability guidance
- analytics and admin workflows for agents/brokerages

The pitch is not just “we can show MLS listings.” The pitch is:

> We make the MLS/listing experience easier, more mobile, more local, and better at converting buyers/renters into agent conversations.

## Business model hypothesis

### Primary model: agent/brokerage subscription

Brokerages/agents pay Hafa Homes for software and distribution, not for the MLS data itself.

Possible paid components:

- brokerage subscription
- per-agent seats
- setup/onboarding fee
- MLS/feed integration fee
- featured agent/listing placement
- lead inbox/CRM tools
- analytics/reporting
- native app packaging/support

### What subscribers get

- agent/brokerage profile pages
- listing presence on Hafa Homes
- direct contact and showing requests
- lead inbox and lead history
- saved-search buyer/renter intent
- brokerage/agent branding
- analytics on listing views, saves, inquiries, and lead sources
- optional website/app embed or landing page support

## MLS/Flexmls understanding

Mike confirmed that Guam brokers use `my.flexmls.com` / Flexmls as the MLS platform.

Working assumptions to validate:

- Guam brokerages/agents already pay membership or MLS-related access fees.
- A participating brokerage/agent may be able to authorize Hafa Homes to connect to their listing/MLS feed.
- The exact feed type is still unknown: IDX, Flexmls IDX product, RESO Web API, RETS, iframe/embed, CSV/export, or another vendor-approved method.
- MLS/Flexmls rules will determine what Hafa Homes can display, how often data must refresh, what attribution/disclaimers are required, whether photos are allowed, and how leads can be routed.

## Key compliance/data questions

Before using real MLS data, confirm with Mike/broker/Flexmls/MLS:

1. Can Hafa Homes be approved as a third-party/vendor app for participating Guam brokerages?
2. Can multiple brokerages authorize feeds into one Hafa Homes consumer platform?
3. Does the feed include all IDX-approved MLS listings or only the subscribing brokerage/agent listings?
4. Can non-subscribed brokerage listings appear on Hafa Homes?
5. Are listing photos included and displayable?
6. What listing broker/agent attribution is required?
7. What MLS disclaimers must appear?
8. How often must listings refresh?
9. Are statuses like pending, under contract, escrow, sold, rented, or withdrawn available/displayable?
10. Can leads go directly to the listing agent, selected agent, or sponsoring brokerage?
11. Are registration walls required for certain details?
12. Can Hafa Homes store/cache listing data and images?

## Architecture implication

Build marketplace-style data ownership from the beginning:

- Brokerage model
- Agent/Realtor model
- Listing belongs to brokerage and optionally listing agent
- Lead can belong to listing, agent, brokerage, and lead source
- Subscription status for brokerage/agent access
- Feed/source metadata on listings
- Sync runs per feed/source
- Attribution/disclaimer fields

This keeps Hafa Homes flexible enough for:

- marketplace model
- participating-broker-only model
- brokerage-sponsored model
- white-label brokerage deployment if needed

## Native app positioning

The current product is a PWA, which is ideal for fast iteration. But Mike is right that native iOS/Android app presence may become a sales differentiator because brokerages may say they already have a website.

Positioning:

- PWA/web app now for speed and validation
- iOS/Android packaging later once product and MLS access are validated
- likely path: Capacitor wrapper around the React app, unless native-only needs justify a rewrite

Native app selling points:

- “Your agents/listings are in a real mobile app”
- push notifications for saved searches and lead responses
- app-store presence
- stronger perceived value than “another website”

## Recommended next product direction

Build toward a broker/agent marketplace while keeping the existing consumer demo polished.

Next major product capabilities:

1. Authentication/accounts for consumers, agents, brokerages, and admins
2. Server-backed saved listings, saved searches, and alert preferences
3. Agent and brokerage profiles
4. Lead routing by listing/agent/brokerage
5. Brokerage/agent admin dashboard
6. MLS/Flexmls sync adapter skeleton
7. Neighborhood intelligence on listing detail pages
8. Mortgage calculator and affordability guide
9. Native app TestFlight/App Store release process
10. Map search polish: loading states, marker clustering/counts, and zoom-gated price pins

## Meeting source

Source notes/transcript:

- `Brain-Dump/work/shimizu-tech/Michael Sazaki (BOH)/2) Talk with Mike about HafaHomes and Shimizu Technology - May 24, 2026.md`
