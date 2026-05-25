# Native Mobile App Plan

_Last updated: 2026-05-24._

## Decision direction

Hafa Homes should keep the existing Rails API and web/PWA proof-of-concept, but start a dedicated native mobile app under `/mobile` using Expo.

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

## Expo versions checked

Checked via npm on 2026-05-24:

```text
expo: 56.0.4
expo-template-blank-typescript: 56.0.18
eas-cli: 19.0.8
```

Recommended scaffold command when ready:

```bash
cd /Users/leonshimizu/Desktop/ShimizuTechnology/hafa-homes
npx create-expo-app@latest mobile --template blank-typescript
```

After scaffolding, verify dependencies with:

```bash
cd mobile
npx expo install --check
npx expo-doctor
```

Recommended global/one-off EAS usage:

```bash
npx eas-cli@latest --version
```

Prefer `npx`/project-local tooling over relying on an old global Expo CLI.

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

- schedule showing
- contact agent
- price tracker / saved search
- lead submission to Rails API

### Phase 4: marketplace features

- agent profiles
- brokerage profiles
- listing ownership/attribution
- lead routing by listing/agent/brokerage

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

Next backend additions should support the marketplace/native direction:

- brokerages
- agents/realtors
- listing ownership/attribution
- lead routing to brokerage/agent
- saved listings/searches persisted to users later
- Flexmls/MLS sync adapters
- neighborhood/school/amenity data

## Current TestFlight status

Updated 2026-05-26:

- `/mobile` Expo app exists and is linked to EAS.
- First iOS production build reached TestFlight and was installed on a real phone.
- Production app env points to `https://hafa-homes.onrender.com`.
- App Store Connect app exists for `com.shimizutechnology.hafahomes`.
- Public App Store release still needs metadata, screenshots, privacy answers, and review submission.

## Authentication plan

Authentication should be added before saved searches, alerts, and persistent saved listings become production-critical.

Recommended approach:

- Rails owns auth/session APIs for both web and mobile.
- Mobile stores tokens in Expo SecureStore, not AsyncStorage.
- Support Sign in with Apple for iOS App Store expectations.
- Support email/password or magic-link email sign-in for web/mobile parity.
- User accounts should own saved listings, saved searches, leads/showing requests, and notification preferences.
- Keep local AsyncStorage saved homes as a guest-mode fallback, then merge or prompt on sign-in.

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

1. Keep `/web` live as the demo and admin/web surface.
2. Replace the native `Request a showing` prototype with an in-app lead form.
3. Add authentication and server-backed saved listings/searches.
4. Improve map loading and zoom-aware marker behavior.
5. Add native marker preview bottom sheet.
6. Add agent/brokerage models to the backend before deeper marketplace work.
7. Validate Flexmls/MLS access and display rules before app-store launch with real listing data.
8. Complete App Store Connect metadata/screenshots/privacy answers for public release.

## Open questions

- Use Expo Router or React Navigation?
- Use Mapbox on native or React Native Maps?
- Should Hafa Homes launch as one central app first or broker-specific branded apps later?
- Will MLS/Flexmls rules allow Hafa Homes as a multi-broker consumer platform?
- Will push notifications be needed for MVP or after saved searches are real?
