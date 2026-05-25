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

Note: the native Mapbox screen uses `@rnmapbox/maps`, which requires custom native code. Plain Expo Go will show a fallback message for the map. Use a custom Expo development build when testing the real Mapbox map:

```bash
npm run ios:dev
# or
npm run android:dev
```

Important env vars:

```env
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_MAPBOX_TOKEN=
```

Use the same public Mapbox token as the web app, but keep it in `.env` and do not commit it.

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

## Node version note

Expo SDK 56 / React Native 0.85 expects Node `^20.19.4` or newer. Local Node `20.19.1` may still work and pass `expo-doctor`, but npm will print engine warnings until Node is upgraded.

## Verification checklist

Before pushing changes:

```bash
cd mobile && npm run typecheck && npm run doctor
cd ../web && npm run build
cd ../api && bundle exec rails runner script/smoke.rb
```
