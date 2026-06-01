# Hafa Homes Current Status and Next Steps

_Last updated: 2026-06-01 after SSI Automation / Hafa Homes meeting with Mike Sakazaki and John Ilao._

## Source context

Product direction comes from the Hafa Homes docs plus Leon/Mike discussion notes:

- `docs/product/product-brief.md`
- `docs/product/platform-strategy.md`
- `docs/product/native-mobile-plan.md`
- Brain-Dump source: `work/shimizu-tech/Michael Sazaki (BOH)/2) Talk with Mike about HafaHomes and Shimizu Technology - May 24, 2026.md`

Mike's key signal: Guam brokerages already have websites/MLS integrations, so Hafa Homes should win by being the polished Guam-first app layer: better mobile UX, better lead capture, clearer agent/brokerage value, and a real App Store/TestFlight presence.

The 2026-06-01 meeting with Mike and John sharpened the strategy: Hafa Homes should be sold broker-first as a brokerage app + lead platform + future property-management portal, with Mike/John helping on sales, relationships, pricing, packaging, and operator/project-management work.

## Where we are now

### Shipped / working

- Rails API deployed at `https://hafa-homes.onrender.com`.
- Web/PWA demo deployed at `https://hafahomes.netlify.app`.
- Privacy policy route exists at `https://hafahomes.netlify.app/privacy`.
- Expo native app exists under `/mobile`.
- EAS project is configured: `@shimizutechnology/hafa-homes`.
- iOS bundle ID is registered: `com.shimizutechnology.hafahomes`.
- First production iOS build was created and appears in TestFlight.
- TestFlight install works on a real phone.
- Mobile app includes:
  - Buy/Rent toggle
  - listing fetch from production Rails API
  - map tab with Mapbox WebView
  - listing detail screen
  - local saved listings via AsyncStorage
  - mortgage calculator gated to for-sale listings
  - agents/more placeholder surfaces
  - in-app showing request form wired to Rails leads
  - zoom-aware map clusters/counts and marker preview cards
  - Phase 1 Local Intel on listing detail pages

### Known limitations

- Listings are still seed/demo data, not authorized MLS/Flexmls data.
- Saved listings are local-only; they should move to authenticated users when auth exists.
- Brokerages/agents are not modeled yet, so lead routing and attribution are still too shallow for the broker-first sales motion.
- Leads are captured, but there is not yet a broker/agent lead inbox or status workflow.
- Property-management/tenant portal features are not built yet.
- Latest main should be deployed and submitted to TestFlight after the Local Intel merge.
- App Store public release metadata/screenshots/privacy answers still need to be completed in App Store Connect.

## Recommended next product priorities

### 1. Brokerage platform foundation

Add brokerages, agents, attribution, and lead routing before going deeper on consumer-only account features.

Recommended scope:

- Brokerage model.
- Agent model.
- Listings belong to brokerage and optionally listing agent.
- Leads route to listing, brokerage, and optionally agent.
- Brokerage/agent data exposed in API payloads.
- Seed demo brokerages/agents for broker-facing demos.
- Mobile listing detail shows brokerage/agent more intentionally.
- Web/admin begins showing brokerage lead context.

Why it matters:

- The business model is now broker-first.
- Brokers need to see how Hafa Homes helps their office and agents, not only consumers.
- MLS access will likely be broker-authorized.
- Pricing/package discussions require a credible broker-facing platform story.

### 2. Authentication and accounts

Add real user accounts before saved searches, alerts, broker/admin roles, and persistent lead history become core features.

Recommended scope:

- Email/password and/or magic-link sign in.
- Apple Sign In for iOS App Store readiness and mobile trust.
- Session/token auth shared by mobile and web.
- User model connected to:
  - saved listings
  - saved searches
  - showing requests/leads
  - notification preferences
- Secure mobile token storage using Expo SecureStore.
- Rails API endpoints for current user, sign in/out, and saved listing/search sync.

Why it matters:

- Saved homes should survive device changes.
- Saved searches and alerts need an owner.
- Lead history and agent follow-up are more valuable if tied to a user.
- App Store users expect account recovery and privacy controls once personal data is stored.

### 3. Lead / showing request flow

The native showing request form now exists and posts to Rails. Next step is broker/agent operationalization.

Recommended scope:

- Broker/agent lead inbox improvement on web.
- Lead statuses: new, contacted, scheduled, closed, spam/archived.
- Lead routing to brokerage and listing agent.
- Email/SMS notification for new leads.
- Internal notes and assignment later.

### 4. Map search polish

The current map now has loading states, broad-zoom clusters/counts, price markers, and marker preview cards. Continue polishing it toward the Locations LLC/Hawaii principle: broad overview first, details only when the user zooms in.

Recommended scope:

- Better initial loading state while listings and Mapbox are loading.
- A map skeleton/brand loading panel instead of blank or jarring marker pop-in.
- Zoom-aware marker display:
  - low zoom / whole island: show clusters, village counts, or no price pills
  - medium zoom: show grouped counts by region/village
  - high zoom: show individual listing price pills
- Marker collision/overlap handling.
- Bottom-sheet listing preview when tapping a marker.
- Keep the full-map mode, but make it feel like the primary search surface.

Locations-style principle:

> At broad map zoom, avoid showing every listing price because it becomes visual noise. Reveal specific price markers only when the user is zoomed into a meaningful neighborhood/village area.

### 5. MLS/Flexmls discovery and data model

Before real public launch, confirm authorized data access and compliance.

Needed decisions:

- Which brokerage/agent is first pilot?
- Is Hafa Homes approved as a vendor/app?
- Feed type: IDX, RESO Web API, RETS, Flexmls IDX, CSV, or other.
- Required listing attribution/disclaimers.
- Photo rights and caching rules.
- Lead routing rules.

### 6. Property management / tenant portal premium tier

Mike explicitly raised property management before the meeting, and the group agreed it is important because Guam real estate is rental-heavy.

Recommended MVP/demo scope:

- Managed properties list.
- Tenant list.
- Lease document/date placeholders.
- Rent payment status placeholder.
- Future online payment workflow notes.
- Keep advanced management on web/admin; mobile can support lightweight tenant tasks later.

### 7. Agent/brokerage marketplace foundation

Add backend models and web admin surfaces for:

- brokerages
- agents
- listings belonging to brokerages/agents
- lead routing
- subscriptions/seats later
- listing/source attribution

## Suggested immediate sprint

1. Deploy latest main and submit a fresh TestFlight with map polish, leads, and Local Intel.
2. Add brokerage and agent data models.
3. Associate listings/leads with brokerage/agent.
4. Add broker/agent demo seed data and API fields.
5. Improve web/admin lead inbox around broker routing/status.
6. Draft package/pricing/proposal docs for Mike/John.
7. Sketch property-management premium-tier demo surface.
8. Prepare App Store Connect metadata/screenshots so Mike/John can share more broadly.

## App Store/TestFlight status

- TestFlight is working for Leon.
- For Mike and others, add them as TestFlight testers in App Store Connect or send the public TestFlight invite link if enabled.
- Public App Store release still requires App Store metadata, screenshots, privacy answers, and final review submission.
