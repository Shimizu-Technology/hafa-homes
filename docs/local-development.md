# Local Development

This repo has three app surfaces:

```text
/api      Rails API
/web      React/Vite PWA
/mobile   Expo iOS/Android app
```

## 1. Rails API

Start the API first because both web and mobile read listings from it.

```bash
cd api
bundle install
bundle exec rails db:prepare db:seed
bundle exec rails runner script/smoke.rb
bundle exec rails server
```

Default local API URL:

```text
http://localhost:3000
```

If port `3000` is busy:

```bash
bundle exec rails server -p 3005
```

Then update the web/mobile API URL env vars accordingly.

## 2. Web PWA

In a second terminal:

```bash
cd web
cp .env.example .env # only if .env does not already exist
npm install
npm run dev
```

Important env vars:

```env
VITE_API_URL=http://localhost:3000
VITE_MAPBOX_TOKEN=
VITE_PUBLIC_POSTHOG_ENABLED=false
```

Do not commit `.env`; it is ignored.

Useful checks:

```bash
npm run build
```

## 3. Expo mobile app

In a third terminal:

```bash
cd mobile
cp .env.example .env # only if .env does not already exist
npm install
npm run typecheck
npm run doctor
npm run start
```

Then:

- press `i` for iOS Simulator
- press `a` for Android Emulator
- scan the QR code with Expo Go for a physical device

The mobile map uses Mapbox GL JS inside `react-native-webview`, so it works in Expo Go as long as `EXPO_PUBLIC_MAPBOX_TOKEN` is set.

Important env vars:

```env
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_BROKERAGE_SLUG=hafa-homes-demo
EXPO_PUBLIC_MAPBOX_TOKEN=
```

Use the same public Mapbox token as the web app, but keep it in `.env` and do not commit it. Restart Expo with `npm run start -- --clear` after changing env vars.

Do not commit `.env`; `mobile/.gitignore` ignores it.

### iOS Simulator

The iOS simulator can usually use:

```env
EXPO_PUBLIC_API_URL=http://localhost:3000
```

Run:

```bash
npm run ios
```

### Android Emulator

Android emulator usually needs:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000
```

Run:

```bash
npm run android
```

### Physical phone with Expo Go

A physical phone cannot use your Mac's `localhost`.

Find your Mac's LAN IP:

```bash
ipconfig getifaddr en0
```

Set `mobile/.env` to something like:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.25:3000
```

Restart Expo after env changes:

```bash
npm run start -- --clear
```

## Node and mobile runtime note

The repository pins Node in `.node-version`; install that exact version before running npm commands. The mobile project uses Expo SDK 57 / React Native 0.86 to avoid the Hermes memory regression now reported against SDK 56. Do not downgrade Expo to make an audit suggestion disappear; use `npx expo install --fix` and `npm run doctor` to preserve SDK-compatible versions.

Each native build must set `EXPO_PUBLIC_BROKERAGE_SLUG`. The default `hafa-homes-demo` is for Hafa Homes development/demo only. Unknown and inactive explicit broker domains/slugs fail closed instead of routing to another tenant.

## Verification checklist

Before pushing changes:

```bash
cd mobile && npm ci && npm run typecheck && npm run doctor && npm run audit:production
cd ../web && npm ci && npm run lint && npm test && npm run build && npm audit --omit=dev --audit-level=high
cd ../api && bundle install && bin/rails test && bin/rails zeitwerk:check && bin/brakeman --no-pager --quiet && bin/bundler-audit check --update && bin/rubocop
```
