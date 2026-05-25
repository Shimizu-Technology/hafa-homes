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

## Recommended next steps

1. Keep `/web` live as the demo and admin/web surface.
2. Add `/mobile` Expo app scaffold.
3. Reuse the existing Rails API first instead of duplicating backend logic.
4. Build native listing list/detail from current API.
5. Add native map + marker preview bottom sheet.
6. Add agent/brokerage models to the backend before deeper marketplace work.
7. Validate Flexmls/MLS access and display rules before app-store launch with real listing data.

## Open questions

- Use Expo Router or React Navigation?
- Use Mapbox on native or React Native Maps?
- Should Hafa Homes launch as one central app first or broker-specific branded apps later?
- Will MLS/Flexmls rules allow Hafa Homes as a multi-broker consumer platform?
- Will push notifications be needed for MVP or after saved searches are real?
