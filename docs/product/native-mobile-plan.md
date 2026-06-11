# Native Mobile App Plan

_Last updated: 2026-06-10 after PR #11 account deletion work, iOS build `1.0.1 (9)` submission, and mobile QA findings._

## Decision direction

Hafa Homes should keep the shared Rails API and web/PWA/admin app while continuing the dedicated native mobile app under `/mobile` using Expo.

Working structure:

```text
/api      Rails API and future MLS sync/admin backend
/web      PWA, broker/admin web surface, landing pages, SEO/content
/mobile   Expo iOS/Android consumer app
```

## Why move toward native now

Mike's feedback suggests that brokerages/agents may already have websites or basic IDX pages. A major selling point for Hafa Homes can be:

> “Your listings and agents are in a real Guam-first mobile app.”

Native iOS/Android helps distinguish Hafa Homes from standard brokerage websites and IDX embeds.

Native app value:

- App Store / Google Play presence
- stronger sales story than “another website”
- native mobile feel
- push notifications later
- native share/deep links/location/haptics later
- better long-term consumer retention
- clearer broker/agent pitch

## Keep the PWA/web app

Do not delete or replace the current `/web` app.

The web app remains useful for:

- proof-of-concept demo
- desktop users
- broker/admin dashboards
- landing/sales pages
- SEO content and village/neighborhood pages
- fast iteration while native app evolves
- fallback if users do not install the native app

## Current mobile implementation status

- `/mobile` Expo app exists and is linked to EAS.
- iOS bundle ID exists: `com.shimizutechnology.hafahomes`.
- Historical TestFlight build was created and installed on a real phone.
- Mobile now has consumer browse/detail/map/saved/request flows plus request history.
- Clerk auth, server-backed saved homes, and self-service account deletion are implemented.
- iOS build `1.0.1 (9)` has been submitted to App Store Connect and is waiting for review.
- Mobile staff/admin mode is intentionally not the main CRM surface yet; web admin remains primary.

Use `npm run typecheck` and `npm run doctor` before mobile changes are pushed.

## Likely Expo stack

Initial libraries to evaluate:

- Expo SDK 56+
- TypeScript
- Expo Router or React Navigation
- TanStack Query for API data fetching
- React Native Maps or Mapbox-compatible native map library
- Bottom sheet library for marker/listing previews
- SecureStore for future auth tokens
- Expo Notifications for future saved-search alerts
- Expo Linking for deep links
- EAS Build for TestFlight / Google Play testing

Map choice should be decided carefully. Mapbox worked well on web, but React Native Mapbox setup, licensing, and Expo compatibility should be validated before implementation.

## Native MVP scope

The first native app should focus on the consumer experience, not every admin feature.

### Phase 1: app shell

- Hafa Homes app icon/splash
- bottom tab navigation
- Search/List tab
- Map tab
- Saved tab
- Agents tab or More tab
- shared API client connected to Rails
- listing list screen
- listing detail screen

### Phase 2: native map search

- map screen
- price markers
- marker bottom-sheet preview
- filter sheet
- save/share/contact actions
- tap into full listing detail

### Phase 3: lead flows

Status: mostly implemented.

- schedule/request showing
- contact/request forms
- lead submission to Rails API
- consumer request history

### Phase 4: marketplace / broker-branded features

Next direction:

- agent profiles
- brokerage profiles
- listing ownership/attribution display polish
- lead routing by listing/agent/brokerage
- optional default brokerage tenant config for broker-branded app builds

### Phase 5: app-store readiness

- EAS project setup
- app identifiers/bundle IDs
- TestFlight build
- Android internal testing
- app metadata/screenshots
- privacy policy
- MLS/compliance disclaimers once data access is real

## Backend/API implications

The existing Rails API should become the shared backend for both `/web` and `/mobile`.

Backend additions already implemented for the marketplace/native direction:

- brokerages
- agents/realtors
- listing ownership/attribution
- lead routing to brokerage/agent
- saved listings persisted to users
- showing requests and consumer request history

Still future:

- saved searches/alerts
- Flexmls/MLS sync adapters after authorization
- neighborhood/school/amenity data beyond current Local Intel

## Current TestFlight/App Store status

Updated 2026-06-10:

- `/mobile` Expo app exists and is linked to EAS.
- Production app env points to `https://hafa-homes.onrender.com`.
- App Store Connect app exists for `com.shimizutechnology.hafahomes`.
- iOS version `1.0.1`, build `9`, has been submitted to App Store Connect and is waiting for review.
- Build `9` includes self-service account deletion.
- Next App Store risk to monitor: production `CLERK_SECRET_KEY` must remain configured so deletion works during review.

## Authentication status

Authentication is now implemented with Clerk across API/web/mobile. Rails owns product authorization and role/tenant scoping.

Implemented:

- Clerk auth.
- Sign-in flows on mobile.
- Server-backed saved listings.
- Migration from local AsyncStorage saved homes.
- Signed-in showing requests attach `user_id` server-side.

Still future:

- proper Profile & settings screen from More.
- editable safe consumer profile fields, including phone and preferred contact.
- prefill showing/contact forms from signed-in profile data.
- consumer/admin form option parity, including `Flexible` preferred time.
- app-first deep links/universal links from emails/SMS into Requests/listings with web fallback.
- saved searches/alerts.
- notification preferences.
- public App Store auth hardening with production Apple credentials.

## Map UX plan

The map should follow the Locations-style pattern: broad geographic browsing first, then listing-level detail when zoomed in.

Recommended behavior:

- Show a branded loading/skeleton state while listings and Mapbox initialize.
- At whole-island zoom, do not show every price marker; use village/region counts or clusters.
- At medium zoom, show grouped counts and let users drill into villages/areas.
- At higher zoom, reveal individual price pills.
- Add a marker/listing bottom-sheet preview before opening full details.
- Reduce marker collision and overlap near dense areas.

## Recommended next steps

1. Monitor App Store review for iOS `1.0.1 (9)` and keep production `CLERK_SECRET_KEY` configured.
2. Build a proper mobile Profile & settings screen reached from More, with edit profile, phone/preferred-contact fields, sign out, privacy links, and delete account in a danger zone.
3. Prefill showing/contact forms from signed-in profile data.
4. Add `Flexible` to consumer preferred-time options so mobile/web/admin stay in parity.
5. Fix notification copy so manual emails do not duplicate greetings.
6. Add app-first notification link handling: universal links for installed app, web fallback for everyone else.
7. Keep `/web` live as the demo/admin/web/SEO surface.
8. Build admin user lifecycle and audit-log hardening for broker demos.
9. Build domain-first broker-branded website/app configuration in the shared platform.
10. Consider `EXPO_PUBLIC_DEFAULT_BROKERAGE_SLUG` or equivalent config for broker-branded builds; web should resolve tenants primarily by broker-owned domains.
11. Improve map loading and zoom-aware marker behavior.
12. Add native marker preview bottom sheet.
13. Add saved searches/alerts after broker-branded foundation.
14. Validate Flexmls/MLS access and display rules before app-store launch with real listing data.

## Open questions

- Use Expo Router or React Navigation?
- Use Mapbox on native or React Native Maps?
- Should Hafa Homes launch as one central app first or broker-specific branded apps later?
- Will MLS/Flexmls rules allow Hafa Homes as a multi-broker consumer platform?
- Will push notifications be needed for MVP or after saved searches are real?
