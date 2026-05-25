# App Store / TestFlight Release Notes

_Last updated: 2026-05-26._

## Current status

- EAS project: `@shimizutechnology/hafa-homes`
- EAS project ID: `d1d219fa-fb79-47c5-9dc2-339645c6b00a`
- iOS bundle ID: `com.shimizutechnology.hafahomes`
- App Store Connect app ID: `6773042903`
- First iOS production build uploaded to TestFlight.
- Build tested on Leon's phone through TestFlight.
- Production API env is configured in EAS: `EXPO_PUBLIC_API_URL=https://hafa-homes.onrender.com`
- Production Mapbox token is configured in EAS as a sensitive variable.

## Useful commands

From `/mobile`:

```bash
# Verify project health
npm run typecheck
npm run doctor

# Create an iOS production build
# Standard/exempt encryption answer: yes
# because the app only uses standard platform HTTPS/TLS.
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

## TestFlight distribution

For Mike and other testers:

1. Open App Store Connect.
2. Go to Hafa Homes.
3. Open TestFlight.
4. Add testers by email or create/enable a public TestFlight link.
5. Add brief testing notes:

```text
Please test the Hafa Homes mobile search flow: Buy/Rent toggle, map search, full-map mode, listing detail, saved homes, and showing request concept. Listings are demo data while MLS/Flexmls access is validated.
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

Search Guam listings by buy or rent, explore homes on a map, save properties for later, and review listing details designed around island life. Hafa Homes is being built for Guam buyers, renters, military families, local residents, agents, brokerages, and property managers.

Current TestFlight builds use demo listing data while authorized MLS/Flexmls integration and brokerage participation are validated.
```

### Keywords draft

```text
guam,real estate,housing,homes,rentals,property,mls,realtor,military relocation
```

### Review notes draft

```text
This build is an early production/TestFlight version of Hafa Homes. Listing data is demo/seed data. The app demonstrates search, map exploration, listing details, saved homes, and showing-request lead flow concepts while authorized MLS/Flexmls data integration is finalized.
```

### Screenshots needed

Because the first iOS app is configured as iPhone-only, prepare iPhone screenshots first:

- Search/map home screen
- Full-map search
- Listing detail
- Saved homes
- Agents or More/resources

If iPad support is re-enabled later, add iPad screenshots too.

### Privacy answers to verify in App Store Connect

Likely data categories once lead forms/auth are added:

- Contact info: name, email, phone if submitted in forms.
- User content: messages/inquiries if submitted.
- Identifiers: account/user ID after auth exists.
- Usage data: analytics if enabled.
- Diagnostics: crash/performance logs if enabled.

Current native app stores saved listing IDs locally on device and fetches listing data from the production API.

## Known release caveats

- Current showing request is still a prototype flow; replace with in-app lead form before broad release.
- Current data is demo data; real MLS/Flexmls integration requires authorized feed and compliance review.
- Map marker behavior should be improved before a wider audience: clusters/counts at broad zoom, price markers only when zoomed in.
