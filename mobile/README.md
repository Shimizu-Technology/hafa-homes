# Hafa Homes Mobile

Expo native iOS/Android app for Hafa Homes.

## Stack

- Expo SDK 57
- React Native 0.86
- TypeScript
- Rails API shared with `/web`

## Setup

See the root [Local Development](../docs/local-development.md) guide for the full API, web, and mobile workflow.

Install the exact Node version pinned by the repository’s `.node-version`. SDK 57 / React Native 0.86 replaces SDK 56 because Expo Doctor now identifies a Hermes memory regression in the older runtime.

```bash
cd mobile
cp .env.example .env
npm ci
npm run typecheck
npm run doctor
npm run start
```

Then press `i` for iOS Simulator, `a` for Android Emulator, or scan the QR code with Expo Go.

For local API access:

- iOS simulator: `EXPO_PUBLIC_API_URL=http://localhost:3000`
- Android emulator: `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000`
- physical device: use your Mac's LAN IP or a deployed API URL

Every build must also set:

```env
EXPO_PUBLIC_BROKERAGE_SLUG=hafa-homes-demo
```

Use a unique, active brokerage slug for a broker-specific build. The Hafa Homes demo slug is not a universal production fallback.

Plain `.env` files are intentionally ignored by `mobile/.gitignore`.

## Current scope

The current native build includes:

- Hafa Homes app shell and branding
- Buy/Rent listing fetch from Rails API
- Listing list screen
- Listing detail screen
- Clerk authentication and server-backed saved homes
- Mapbox map screen with price markers through Expo-compatible WebView
- brokerage-scoped agents, lead intent, profiles, and requests
- showing, price-watch, search-assist, account, request-history, and account-deletion flows

## Mapbox

The app uses Mapbox GL JS inside `react-native-webview`, so it works in Expo Go and does not require a custom native dev build.

Set the token in `mobile/.env`:

```bash
EXPO_PUBLIC_MAPBOX_TOKEN=pk_...
```

Then restart Expo after env changes:

```bash
npm run start -- --clear
```

## Verification

```bash
npm run typecheck
npm run doctor
npm run audit:production
```

The production audit fails every unaccepted high/critical advisory. A narrow, expiring exception may only cover an unpatched upstream build-tool issue whose affected parser cannot receive user-controlled data in the shipped app.
