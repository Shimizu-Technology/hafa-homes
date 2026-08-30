# App Store / TestFlight Release Notes

_Last updated: 2026-08-16 while preparing the iOS `1.0.3` release candidate in PR #22._

## Current status

- EAS project: `@shimizutechnology/hafa-homes`
- EAS project ID: `d1d219fa-fb79-47c5-9dc2-339645c6b00a`
- iOS bundle ID: `com.shimizutechnology.hafahomes`
- App Store Connect app ID: `6773042903`
- iOS `1.0.2 (15)` is approved/live on the App Store.
- iOS `1.0.3` is the current release candidate; its EAS build, TestFlight validation, and App Review submission are pending.
- iOS `1.0.1 (11)` is the previous approved/live App Store build.
- EAS build ID for `1.0.2 (15)`: `23e1f238-9906-4c54-bebb-0ac666b5df39`.
- EAS submission ID for the App Store upload: `1ae27913-c0f6-4520-8975-a43ed52644db`.
- The App Store version was submitted with automatic release enabled and released after approval.
- A local iOS build was also attempted, but local Xcode `16.4` / Swift `6.1` cannot build Expo SDK 56's `ExpoModulesJSI` Swift package because it declares Swift tools `6.2`. Use EAS cloud for future production builds unless local Xcode is upgraded.
- Production API env is configured in EAS: `EXPO_PUBLIC_API_URL=https://hafa-homes.onrender.com`
- Production brokerage routing is explicit in EAS: `EXPO_PUBLIC_BROKERAGE_SLUG=hafa-homes-demo`
- EAS production builds fail before dependency installation unless the API is public HTTPS, Clerk uses a `pk_live_` key, brokerage routing is explicit, Apple authentication is enabled, and a public Mapbox token is present. Run `npm run preflight:production` from `mobile/` with the production environment before starting a release.
- Production Mapbox token is configured in EAS as a sensitive variable.

## Current mobile feature set to release/review

The latest mobile app should be reviewed as a demo/early production Guam real estate app with:

- public listing browse/search;
- buy/rent toggle;
- map exploration;
- listing detail;
- Local Intel/listing context;
- mortgage calculator for sale listings;
- Clerk auth;
- server-backed saved homes;
- preferred-agent selection for signed-in users;
- showing/contact request form;
- price watch request form;
- consumer request history;
- durable Buyer/Search Profile fields and request prefills;
- first-party search context and progressive search-assist prompts;
- self-service account deletion from web and mobile account screens;
- Hafa Homes website link from the mobile More screen;
- refreshed app icon asset;
- demo listing data while MLS/Flexmls access is validated.

Do **not** claim live MLS data until authorization/compliance is complete.

## Important release dependency

Before submitting a new mobile build for Apple review/TestFlight, verify the production API has the migrations/endpoints the app depends on.

At minimum, production API should include:

- Clerk auth/user endpoints.
- server-backed saved listing endpoints.
- `POST /api/v1/leads`.
- `GET /api/v1/me/leads` for request history.
- `GET /api/v1/me/search_profile` and `PATCH /api/v1/me/search_profile`.
- lead intent endpoints such as `POST /api/v1/lead_intent/events`.
- current listing detail/listing search endpoints.

If the mobile app points at `https://hafa-homes.onrender.com`, then Render production migrations must run before the mobile build is reviewed seriously.

## Versioning note

Apple closes a pre-release train once that app version has been approved/released. If App Store Connect rejects a build with:

```text
90186: Invalid Pre-Release Train
90062: CFBundleShortVersionString must contain a higher version
```

then bump `expo.version` in `mobile/app.json`, for example from `1.0.0` to `1.0.1`, commit it, rebuild, and submit again. EAS `autoIncrement` handles the internal iOS build number; it does not replace the need to bump the public app version after Apple closes the previous train.

## Current live build

```text
Version: 1.0.1
Build number: 11
EAS build ID: 24a33127-0dae-46e0-8bb1-727918e643c2
Status: Previous approved/live App Store build
```

Build `11` replaced rejected build `10` and was the public iOS release before `1.0.2 (15)`.

## Submitted 1.0.2 build

```text
Version: 1.0.2
Build number: 15
Source commit: 0b2e418a8e557c878e7e62d75bb14f8f37a4d2f0
EAS build ID: 23e1f238-9906-4c54-bebb-0ac666b5df39
IPA artifact: https://expo.dev/artifacts/eas/wDsUdl8TeT5vnnenCAN-mkR2Z5HAzTjquuHWO3kQziE.ipa
EAS submission ID: 1ae27913-c0f6-4520-8975-a43ed52644db
App Store Connect status: Approved/live as of 2026-07-02
Release setting: Automatically released after approval
```

Submission metadata notes:

- Build selected: `1.0.2 (15)`.
- Promotional text mentions Guam homes/rentals, saved properties, preferred agent, and showing/price watch requests.
- What's New mentions first-party search context, smarter search-assist prompts, better request routing, request history, map/listing navigation, app icon presentation, and the in-app `hafahomes.com` link.
- Review notes clarify that price watch is currently a request workflow, not automated price-alert notifications, and that the app uses standard HTTPS/TLS encryption only.

## Prepared 1.0.3 release candidate

```text
Version: 1.0.3
Release PR: #22
Build number: Pending EAS production build
TestFlight status: Pending upload and physical-device smoke test
App Review status: Not submitted
```

This candidate is based on the product-hardening work merged in PR #21 and includes the current Guam search, brokerage routing, agent/account, showing-request, local-intel, and mortgage-calculator flows. Before upload, the production configuration was verified with a live Clerk key, Apple Sign-In enabled, the production API URL, the explicit `hafa-homes-demo` brokerage slug, and the production Mapbox token.

Local release validation completed on 2026-08-16:

- TypeScript passed.
- Expo Doctor passed all 21 checks.
- The production dependency audit found no unaccepted high or critical advisories.
- Production-configured iOS and Android Hermes exports completed.
- Read-only production API smoke checks passed for health, brokerage context, listings/search, listing detail, and agents.
- Computer Use QA on an iOS Simulator passed for search, listing detail and photos, local intel, map rendering, agents, showing-request form, mortgage calculator, account-gated saved/request screens, More, and auth entry.

The remaining release gate is a TestFlight smoke test on a physical iPhone using the uploaded production build, including native Apple Sign-In, authenticated saved homes, request history, profile, and account deletion.

## Native Apple/Clerk setup for the next build

The preferred production fix is native Sign in with Apple through Clerk Expo, not the browser OAuth fallback used in older Shimizu apps.

Required before submitting the replacement build:

- Clerk production app is configured and EAS uses a `pk_live_...` publishable key.
- Clerk Dashboard has a Native Application for:
  - Apple Team/App ID Prefix: `4T358A5S74`
  - iOS bundle ID: `com.shimizutechnology.hafahomes`
- Clerk Apple SSO connection is enabled for sign-up and sign-in.
- EAS production env includes:
  - `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...`
  - `EXPO_PUBLIC_ENABLE_APPLE_AUTH=true`
  - keep `EXPO_PUBLIC_ENABLE_GOOGLE_AUTH=false` until Google OAuth is separately verified.
- Render API env uses the matching live Clerk instance:
  - `CLERK_ISSUER`
  - `CLERK_SECRET_KEY`
  - no stale test `CLERK_JWKS_URL` overriding the issuer.
- Netlify/web uses the matching live `VITE_CLERK_PUBLISHABLE_KEY`.
- TestFlight smoke on a physical iPhone/iPad confirms Apple sign-in creates a session, saved homes work, profile loads, and account deletion works.

## Recommended future replacement-build sequence

Use this sequence if another replacement build is needed after App Review feedback or the next mobile feature branch.

### 1. Verify production API readiness

From local repo:

```bash
cd api
bundle exec rails runner script/smoke.rb
```

For production, verify separately that:

- latest API code is deployed;
- production migrations have run;
- production seeded/demo listings exist;
- Clerk production/test issuer env vars are correct;
- `CLERK_SECRET_KEY` is set on the API so self-service account deletion can remove the Clerk user;
- `GET /api/v1/listings` works;
- authenticated saved/request endpoints work with the mobile Clerk token;
- authenticated `DELETE /api/v1/me` works from a disposable test account before App Review.

### 2. Verify mobile locally

From `/mobile`:

```bash
npm run typecheck
npm run doctor
npm run start -- --clear
```

Test on a physical phone or simulator:

- app opens;
- listings load from production API or intended API;
- listing detail opens;
- map loads;
- sign-in works;
- save/unsave works;
- showing request submits;
- request history loads after sign-in;
- account deletion works from a disposable test account.

### 3. Build iOS production/TestFlight build

From `/mobile` after the EAS iOS quota resets or the EAS plan is upgraded:

```bash
eas build -p ios --profile production --auto-submit-with-profile production --what-to-test "Please test listing search, map browsing, saved homes after sign-in, showing/contact requests, request history, and the Account search profile. Listings are demo data while MLS/Flexmls access is validated."
```

Standard/exempt encryption answer:

```text
yes
```

Reason: the app only uses standard platform HTTPS/TLS.

### 4. Submit latest build to App Store Connect

If the build was not auto-submitted:

```bash
eas submit -p ios --latest --profile production
```

### 5. TestFlight distribution

For Mike, John, and other testers:

1. Open App Store Connect.
2. Go to Hafa Homes.
3. Open TestFlight.
4. Add testers by email or create/enable a public TestFlight link.
5. Add testing notes.

Suggested testing notes:

```text
Please test the Hafa Homes mobile search flow: Buy/Rent toggle, map search, listing detail, saved homes after sign-in, showing request submission, and request history. Listings are demo data while MLS/Flexmls access and brokerage participation are validated.
```

## Useful commands

From `/mobile`:

```bash
# Verify project health
npm run typecheck
npm run doctor

# Create and auto-submit an iOS production build
# Run after EAS iOS quota resets or after upgrading the EAS plan.
eas build -p ios --profile production --auto-submit-with-profile production --what-to-test "Please test listing search, map browsing, saved homes after sign-in, showing/contact requests, request history, and the Account search profile. Listings are demo data while MLS/Flexmls access is validated."

# Or submit the latest successful EAS build manually
eas submit -p ios --latest --profile production
```

If `eas` is missing after changing Node versions:

```bash
nodenv rehash
which eas
eas --version
```

## App Store public release checklist

Before submitting for public App Store review:

### App information

- Name: `Hafa Homes`
- Subtitle suggestion: `Guam real estate search`
- Category: Lifestyle or House & Home, depending App Store Connect availability.
- Privacy policy URL: `https://hafahomes.netlify.app/privacy`
- Support URL: `https://hafahomes.netlify.app`
- Marketing URL: `https://hafahomes.netlify.app`

### App description draft

```text
Hafa Homes is a Guam-first real estate app for exploring homes, rentals, neighborhoods, and local housing guidance.

Search Guam listings by buy or rent, explore homes on a map, save properties for later, and submit showing requests. Hafa Homes is being built for Guam buyers, renters, military families, local residents, agents, brokerages, and property managers.

Current builds use demo listing data while authorized MLS/Flexmls integration and brokerage participation are validated.
```

### Keywords draft

```text
guam,real estate,housing,homes,rentals,property,realtor,military relocation
```

Avoid `MLS` as a keyword until authorized data/compliance is confirmed.

### Review notes draft

```text
This build is an early production/TestFlight version of Hafa Homes. Listing data is demo/seed data. The app demonstrates search, map exploration, listing details, saved homes, showing-request lead flow, request history, and self-service account deletion while authorized listing data integrations are finalized.
```

### Screenshots needed

Because the first iOS app is configured as iPhone-only, prepare iPhone screenshots first:

- Search/list home screen.
- Full-map search.
- Listing detail.
- Saved homes signed-in state.
- Request history.
- More/account/resources.

If iPad support is re-enabled later, add iPad screenshots too.

### Privacy answers to verify in App Store Connect

Likely data categories now that auth and lead forms exist:

- Contact info: name, email, phone if submitted in forms or account profile.
- User content: messages/inquiries if submitted.
- Identifiers: account/user ID after auth exists.
- Usage data: analytics if enabled.
- Diagnostics: crash/performance logs if enabled.

Current app uses Clerk for authentication and stores account-backed saved homes through the Hafa Homes API.

## Known release caveats

- Current data is demo data; real MLS/Flexmls integration requires authorized feed and compliance review.
- Public App Store listing should clearly state demo/early availability if submitted before real listing authorization.
- Map marker behavior can still improve: clusters/counts at broad zoom, price markers only when zoomed in, and native marker preview bottom sheet.
- Production notification sending is separate from mobile review and should remain gated unless intentionally enabled.
- Broker-specific apps later require a separate Apple strategy because Apple may scrutinize templated white-label apps.
