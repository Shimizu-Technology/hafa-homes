# Hafa Homes Mobile

Expo native iOS/Android app for Hafa Homes.

## Stack

- Expo SDK 56
- React Native 0.85
- TypeScript
- Rails API shared with `/web`

## Setup

Expo SDK 56 / React Native 0.85 expects Node `^20.19.4` or newer. Leon's current local Node `20.19.1` still passes `expo-doctor`, but npm prints engine warnings until Node is bumped.

```bash
cd mobile
cp .env.example .env
npm install
npm run typecheck
npm run doctor
npm run ios
```

For local API access:

- iOS simulator: `EXPO_PUBLIC_API_URL=http://localhost:3000`
- Android emulator: `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000`
- physical device: use your Mac's LAN IP or a deployed API URL

## Current scope

This initial native build includes:

- Hafa Homes app shell and branding
- Buy/Rent listing fetch from Rails API
- Listing list screen
- Listing detail screen
- Saved homes local mock state
- Map concept screen ready for native map provider decision
- Agents/Brokerage placeholder surface
- More/Roadmap screen

## Next mobile work

- Pick native map provider: Mapbox vs React Native Maps
- Add marker bottom-sheet previews
- Add real schedule-showing lead form
- Add mortgage calculator / affordability guide
- Add neighborhood/schools/parks sections
- Add brokerage/agent profiles after backend models are added
- Configure EAS Build/TestFlight when Apple/Google accounts are ready
