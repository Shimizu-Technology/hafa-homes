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

The native entry screen checks `https://hafahomes.com/service-status.json` before initializing Clerk or the application. A paused or failed check shows the local pause/recovery screen and blocks Rails API calls. Checks time out after five seconds and repeat on foreground or manual retry. Confirmed pause/unavailability unmounts the runtime, including native modals; brief checks that return available preserve the mounted runtime. Unsaved forms are discarded when the service becomes paused/unavailable.

Privacy opens the static website in Safari's in-app browser. Support opens the user's mail app, with the support address shown when mail is unavailable. This does not replace working account-deletion initiation for public App Review. The backend must remain paused until an explicit resume decision.

For isolated simulator recovery QA only, development builds accept `EXPO_PUBLIC_SERVICE_STATUS_URL`. Production bundles always use the canonical CDN URL regardless of this variable. Point `EXPO_PUBLIC_API_URL` at the owned API fixture too; never flip the deployed status to exercise a fixture.

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

### Temporary build-tool advisory exceptions — October 10, 2026

The audit accepts only the following two additional advisory IDs until **October 24, 2026**. Both upstream advisories currently list no patched release; remove the exception and update the lockfile when a compatible fix becomes available. All other high/critical findings still fail the gate.

- **1240912 / [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv):** `expo@57.0.27` → `@expo/cli@57.0.28` → `node-forge@1.4.0`, directly and through `@expo/code-signing-certificates@0.0.6`. The affected RSA verification is used by CLI developer signing/certificate tooling (`build/src/utils/codesigning.js`, `build/src/run/ios/codeSigning/Security.js`, and the certificate package's `build/main.js`). These tools handle developer keys/certificates and Expo development certificates; the application does not accept user-supplied certificates or signatures through them. This remains a tooling risk, so use approved signing inputs and do not treat the library itself as fixed.
- **1240992 / [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm):** Metro's `metro-file-map@0.84.5` → `micromatch@4.0.8` → `braces@3.0.3`. `metro-file-map/src/watchers/common.js` matches repository file paths using build-configuration globs. Do not supply untrusted glob patterns to the build tooling. The native application does not import these packages or pass user inputs to this parser.

Verification used Node 22.22.3 and Expo SDK 57 with `npx expo export --platform ios --platform android --source-maps`. Both Hermes exports passed. Their source maps contained 754 iOS and 752 Android source entries, with no `node-forge`, `@expo/code-signing-certificates`, affected CLI signing utilities, `braces`, `micromatch`, or `metro-file-map` sources. Expo CLI's separate `metro-require/require.js` module loader is included; it is not an affected signing or glob-parser path. This evidence covers production JavaScript bundles, not native device acceptance or a new store release.
