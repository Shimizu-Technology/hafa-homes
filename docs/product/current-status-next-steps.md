# Hafa Homes Current Status and Next Steps

_Last updated: 2026-05-26 after first TestFlight build._

## Source context

Product direction comes from the Hafa Homes docs plus Leon/Mike discussion notes:

- `docs/product/product-brief.md`
- `docs/product/platform-strategy.md`
- `docs/product/native-mobile-plan.md`
- Brain-Dump source: `work/shimizu-tech/Michael Sazaki (BOH)/2) Talk with Mike about HafaHomes and Shimizu Technology - May 24, 2026.md`

Mike's key signal: Guam brokerages already have websites/MLS integrations, so Hafa Homes should win by being the polished Guam-first app layer: better mobile UX, better lead capture, clearer agent/brokerage value, and a real App Store/TestFlight presence.

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

### Known limitations

- Listings are still seed/demo data, not authorized MLS/Flexmls data.
- Showing request flow is still proof-of-concept; it needs an in-app lead form wired to Rails.
- Saved listings are local-only; they should move to authenticated users when auth exists.
- Map markers are visible too early at full-island zoom and can crowd the map.
- Map loading state should feel smoother and more intentional.
- App Store public release metadata/screenshots/privacy answers still need to be completed in App Store Connect.

## Recommended next product priorities

### 1. Authentication and accounts

Add real user accounts before saved searches, alerts, and persistent lead history become core features.

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

### 2. Lead / showing request flow

Replace the mailto/prototype fallback with a native in-app flow.

Recommended scope:

- Request showing form from listing detail.
- Contact method preference: phone, text, email.
- Preferred date/time.
- Message field prefilled with listing title/address.
- POST to existing Rails leads endpoint.
- Success state with next steps.
- Admin/agent lead inbox improvement on web.

### 3. Map search polish

The current map proves the concept, but should become more like the Locations LLC/Hawaii model: broad overview first, details only when the user zooms in.

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

### 4. MLS/Flexmls discovery and data model

Before real public launch, confirm authorized data access and compliance.

Needed decisions:

- Which brokerage/agent is first pilot?
- Is Hafa Homes approved as a vendor/app?
- Feed type: IDX, RESO Web API, RETS, Flexmls IDX, CSV, or other.
- Required listing attribution/disclaimers.
- Photo rights and caching rules.
- Lead routing rules.

### 5. Agent/brokerage marketplace foundation

Add backend models and web admin surfaces for:

- brokerages
- agents
- listings belonging to brokerages/agents
- lead routing
- subscriptions/seats later
- listing/source attribution

## Suggested immediate sprint

1. Convert Request Showing into a native in-app lead form.
2. Add auth architecture and basic account endpoints.
3. Persist saved listings server-side for authenticated users.
4. Improve map loading state.
5. Implement zoom-aware map marker behavior.
6. Prepare App Store Connect metadata/screenshots so Mike can share more broadly.

## App Store/TestFlight status

- TestFlight is working for Leon.
- For Mike and others, add them as TestFlight testers in App Store Connect or send the public TestFlight invite link if enabled.
- Public App Store release still requires App Store metadata, screenshots, privacy answers, and final review submission.
