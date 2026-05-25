# Hafa Homes Mobile

Expo native iOS/Android app for Hafa Homes.

## Stack

- Expo SDK 56
- React Native 0.85
- TypeScript
- Rails API shared with `/web`

## Setup

See the root [Local Development](../docs/local-development.md) guide for the full API, web, and mobile workflow.

Expo SDK 56 / React Native 0.85 expects Node `^20.19.4` or newer. Leon's current local Node `20.19.1` still passes `expo-doctor`, but npm prints engine warnings until Node is bumped.

```bash
cd mobile
cp .env.example .env
npm install
npm run typecheck
npm run doctor
npm run start
```

Then press `i` for iOS Simulator, `a` for Android Emulator, or scan the QR code with Expo Go.

For local API access:

- iOS simulator: `EXPO_PUBLIC_API_URL=http://localhost:3000`
- Android emulator: `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000`
- physical device: use your Mac's LAN IP or a deployed API URL

Plain `.env` files are intentionally ignored by `mobile/.gitignore`.

## Current scope

This initial native build includes:

- Hafa Homes app shell and branding
- Buy/Rent listing fetch from Rails API
- Listing list screen
- Listing detail screen
- Saved homes local mock state
- Native Mapbox map screen with price markers when using a custom Expo dev build
- Agents/Brokerage placeholder surface
- More/Roadmap screen

## Mapbox

The app uses `@rnmapbox/maps` for the native map screen.

Important: `@rnmapbox/maps` requires custom native code, so the real map will not run inside plain Expo Go. Expo Go falls back to a token/dev-build message. To test Mapbox locally, create a custom Expo development build after setting `EXPO_PUBLIC_MAPBOX_TOKEN` in `.env`.

```bash
EXPO_PUBLIC_MAPBOX_TOKEN=pk_...
npm run ios
# or create an EAS/dev-client build when ready
```

## Next mobile work

- Add marker bottom-sheet previews
- Add real schedule-showing lead form
- Add mortgage calculator / affordability guide
- Add neighborhood/schools/parks sections
- Add brokerage/agent profiles after backend models are added
- Configure EAS Build/TestFlight when Apple/Google accounts are ready
