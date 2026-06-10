# App Store / TestFlight Release Notes

_Last updated: 2026-06-10 after PR #10 broker CRM expansion merged._

## Current status

- EAS project: `@shimizutechnology/hafa-homes`
- EAS project ID: `d1d219fa-fb79-47c5-9dc2-339645c6b00a`
- iOS bundle ID: `com.shimizutechnology.hafahomes`
- App Store Connect app ID: `6773042903`
- First iOS production build previously uploaded to TestFlight.
- Build previously tested on Leon's phone through TestFlight.
- App Store version `1.0.0` is already approved/ready for distribution, so new TestFlight/App Store builds must use a higher marketing version such as `1.0.1`.
- Production API env is configured in EAS: `EXPO_PUBLIC_API_URL=https://hafa-homes.onrender.com`
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
- showing/contact request form;
- consumer request history;
- demo listing data while MLS/Flexmls access is validated.

Do **not** claim live MLS data until authorization/compliance is complete.

## Important release dependency

Before submitting a new mobile build for Apple review/TestFlight, verify the production API has the migrations/endpoints the app depends on.

At minimum, production API should include:

- Clerk auth/user endpoints.
- server-backed saved listing endpoints.
- `POST /api/v1/leads`.
- `GET /api/v1/me/leads` for request history.
- current listing detail/listing search endpoints.

If the mobile app points at `https://hafa-homes.onrender.com`, then Render production migrations must run before the mobile build is reviewed seriously.

## Versioning note

Apple closes a pre-release train once that app version has been approved/released. If App Store Connect rejects a build with:

```text
90186: Invalid Pre-Release Train
90062: CFBundleShortVersionString must contain a higher version
```

then bump `expo.version` in `mobile/app.json`, for example from `1.0.0` to `1.0.1`, commit it, rebuild, and submit again. EAS `autoIncrement` handles the internal iOS build number; it does not replace the need to bump the public app version after Apple closes the previous train.

## Recommended next mobile release sequence

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
- `GET /api/v1/listings` works;
- authenticated saved/request endpoints work with the mobile Clerk token.

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
- request history loads after sign-in.

### 3. Build iOS production/TestFlight build

From `/mobile`:

```bash
eas build -p ios --profile production
```

Standard/exempt encryption answer:

```text
yes
```

Reason: the app only uses standard platform HTTPS/TLS.

### 4. Submit latest build to App Store Connect

```bash
eas submit -p ios --latest
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

# Create an iOS production build
eas build -p ios --profile production

# Submit the latest build to App Store Connect/TestFlight
eas submit -p ios --latest
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
This build is an early production/TestFlight version of Hafa Homes. Listing data is demo/seed data. The app demonstrates search, map exploration, listing details, saved homes, showing-request lead flow, and request history while authorized MLS/Flexmls data integration is finalized.
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
