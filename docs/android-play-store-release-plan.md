# Android Play Store Release Plan

_Last updated: 2026-07-01 after reviewing current Google Play, Expo/EAS, and Hafa Homes release requirements._

## Goal

Ship Hafa Homes on Google Play with the same production quality and compliance posture as the approved iOS app.

Current positioning for store copy and review notes:

```text
Guam-first real estate search for homes, rentals, neighborhoods, saved homes, buyer/search profiles, and showing/contact requests.
```

Do **not** claim live MLS/FlexMLS data until authorized feed access, attribution, and compliance rules are confirmed.

## Current Hafa Homes Android configuration

Expo/EAS project:

```text
@shimizutechnology/hafa-homes
EAS project ID: d1d219fa-fb79-47c5-9dc2-339645c6b00a
```

Android package name already configured in `mobile/app.json`:

```text
com.shimizutechnology.hafahomes
```

Current Android-ready app configuration:

- Expo SDK 56 project.
- Android package name is set.
- Adaptive icon assets exist.
- Deep link scheme exists: `hafahomes://`.
- EAS `production` build profile uses `autoIncrement` and production env.
- Production EAS env includes API URL, Clerk key, Mapbox token, and auth feature flags.
- Native app supports public browsing, Clerk auth, saved homes, showing/contact requests, request history, Buyer/Search Profile, and account deletion.

## Main decisions before starting

### 1. Developer account type

Google Play offers **Personal** and **Organization** developer accounts.

Recommended for Hafa Homes / Shimizu Technology: **Organization account**.

Why:

- Looks more professional for a brokerage-facing product.
- Public developer profile can use Shimizu Technology/Hafa Homes business information.
- New personal developer accounts created after Nov. 13, 2023 must complete a 12-tester / 14-day closed-test requirement before production access.

Organization account requirements include:

- organization legal name;
- organization address;
- organization phone number;
- organization website;
- contact name/email/phone;
- public developer email and phone;
- D-U-N-S number.

If Shimizu Technology does not already have a D-U-N-S number, request/verify one early because that can take time.

Personal account requirements include:

- legal name/address;
- contact email/phone;
- public developer email;
- $25 one-time fee;
- identity verification;
- Android device verification through the Play Console mobile app for newer accounts;
- if created after Nov. 13, 2023: closed testing with at least 12 opted-in testers for 14 consecutive days before production access.

### 2. First release target

Recommended first target:

1. Internal testing track.
2. Closed testing track if required by the account type.
3. Production only after Android smoke testing and Play review readiness.

Do not jump straight to production before the app has been installed from Play on at least one physical Android device.

## Account and Play Console setup checklist

- [ ] Confirm whether Shimizu Technology already has a Google Play Developer account.
- [ ] If not, create a Google Play Developer account.
  - [ ] Prefer Organization account if D-U-N-S/business verification is available.
  - [ ] Otherwise personal account is workable, but plan for the 12-tester / 14-day closed-test requirement.
- [ ] Pay the $25 one-time registration fee.
- [ ] Complete identity / organization verification.
- [ ] Create the Hafa Homes app in Play Console.
- [ ] Use exact package name:

```text
com.shimizutechnology.hafahomes
```

Package names cannot be changed after release.

## Store listing checklist

Google Play listing fields:

- [ ] App name: `Hafa Homes`.
- [ ] Default language: English (United States).
- [ ] App/game: App.
- [ ] Free/paid: Free.
- [ ] Category: likely `House & Home` or `Lifestyle`; confirm in Play Console.
- [ ] Developer contact email: likely `hello@hafahomes.com` or Shimizu support email.
- [ ] Website:

```text
https://hafahomes.com
```

- [ ] Privacy policy:

```text
https://hafahomes.com/privacy
```

Recommended improvement before final production rollout:

- [ ] Add a dedicated web account/data deletion page, for example:

```text
https://hafahomes.com/account-deletion
```

Google requires apps that allow account creation to provide:

- an in-app account deletion path; and
- a web link where users can request account/data deletion without reinstalling the app.

Hafa Homes already has in-app deletion on web/mobile. A dedicated web deletion page would make Play Console’s Data Safety/account deletion form cleaner than pointing only to the privacy policy.

## Store copy drafts

### Short description

Max 80 characters.

```text
Search Guam homes and rentals, save favorites, and request showings.
```

### Full description

```text
Hafa Homes is a Guam-first real estate app for exploring homes, rentals, neighborhoods, and local housing guidance.

Search Guam homes by buy or rent, browse listings on a map, view property details, save homes after signing in, manage your buyer/search profile, and request showing or agent follow-up.

Hafa Homes is built for Guam buyers, renters, military families, local residents, agents, brokerages, and property managers.

Current builds may include demo listing data while authorized MLS/FlexMLS integration and brokerage participation are validated.
```

### Internal testing release notes

```text
Initial Android internal test for Hafa Homes. Please test listing search, buy/rent toggle, map browsing, listing detail, saved homes after sign-in, showing/contact requests, request history, Account search profile, and account deletion. Listings may be demo data while MLS/FlexMLS authorization is validated.
```

## Store asset requirements

### App icon

Google Play requires a separate store-listing icon:

- 512 x 512 px.
- 32-bit PNG with alpha.
- Max file size: 1024 KB.
- No badges/text implying ranking, price, Google Play category, or performance.

Current source candidate:

```text
mobile/assets/icon.png
```

Note: this file should be visually checked before upload. It should extend to the full square canvas because the store/app launcher will apply its own rounding/mask.

### Feature graphic

Required:

- 1024 x 500 px.
- JPEG or 24-bit PNG.
- No alpha.

Suggested content:

```text
Hafa Homes
Guam homes, rentals, and neighborhood search
```

Avoid:

- “#1”, “best”, “new”, “free”, “download now”, “install now”, or other store-performance/CTA language.
- Claims about live MLS data.

### Screenshots

Google minimum for publishing: at least 2 screenshots across device types.

Recommended for Hafa Homes: 4–6 phone screenshots.

Recommended screenshot set:

1. Search/listing feed.
2. Map search.
3. Listing detail.
4. Saved homes signed-in state.
5. Showing/contact request form.
6. Account Buyer/Search Profile or request history.

Requirements:

- JPEG or 24-bit PNG, no alpha.
- Minimum dimension: 320 px.
- Maximum dimension: 3840 px.
- Max side cannot be more than 2x the min side.

Best-practice dimensions for phone portrait screenshots:

```text
1080 x 1920 px or similar 9:16 portrait
```

For stronger Play placement, Google recommends at least 4 app screenshots with minimum 1080 px resolution.

### Tablet screenshots

Only prepare tablet screenshots if Play Console requires them for the target device distribution or if we intentionally support tablets. Current iOS app is phone-only, and the Android app should be smoke-tested before claiming tablet optimization.

## Policy / App content checklist

Complete Play Console **App content** declarations carefully.

### Privacy policy

- [ ] Add privacy policy URL:

```text
https://hafahomes.com/privacy
```

- [ ] Prefer adding a dedicated deletion URL before production:

```text
https://hafahomes.com/account-deletion
```

### Ads declaration

Likely answer:

```text
No ads
```

There is no ad SDK or ad-supported monetization in the current Hafa Homes app.

### App access / sign-in details

Public browsing works without login, but some features are account-gated:

- saved homes;
- request history;
- Buyer/Search Profile;
- account deletion.

Recommended:

- [ ] Provide Google reviewers a dedicated demo account.
- [ ] Disable MFA/new-device friction for that Clerk user if possible.
- [ ] Keep the account separate from real users.

Example app access note:

```text
Most listing browsing works without signing in. To test saved homes, request history, Buyer/Search Profile, and account deletion, use the provided reviewer account. Listing data may be demo data while MLS/FlexMLS authorization is validated.
```

### Target audience and content

Likely answer:

```text
Not directed to children. Intended for adults and general real estate consumers researching Guam homes/rentals.
```

### Content rating

Expected to be low maturity / general audience, but complete the questionnaire based on actual app content.

### Data Safety — Hafa-specific draft

Google defines “collection” as data transmitted off the device. Hafa Homes transmits submitted forms, account data, saved homes, search profile, and first-party activity to the Hafa Homes API.

Likely data categories to disclose:

#### Personal info

- Name: collected when submitted in account/profile or lead forms.
- Email address: collected for Clerk account and lead forms.
- Phone number: collected when submitted in contact/profile/lead forms.
- User IDs: Clerk/Hafa Homes user IDs for signed-in users.

#### App activity

- App interactions / pages viewed / listing views.
- Saved homes.
- Search filters and listing-intent events.
- Prompt responses / Buyer/Search Profile activity.

#### User content / messages

- Showing request messages or other inquiry text submitted by the user.

#### Financial info / other financial info

Conservative disclosure recommended because Hafa Homes asks for:

- budget/price range;
- target price for price watch requests;
- prequalification status;
- timeline.

Even though the app does not process payments, these are housing/finance-adjacent user inputs.

#### Location

Likely answer:

```text
No device location collection
```

Current mobile code does not request GPS/device location. Users can search by village/listing area, but that is search input, not device location permission.

#### Photos/videos/audio/files

Likely answer:

```text
No
```

Current Hafa Homes consumer app does not let users upload media.

#### Data sharing

Review with the privacy policy and actual vendors. Service providers likely include:

- Clerk for authentication;
- Mapbox for maps;
- hosting/API infrastructure;
- analytics/monitoring if enabled.

Google treats service-provider processing differently from third-party sharing, but the Data Safety form should match the actual privacy policy and SDK behavior.

#### Security practices

Likely:

- Data encrypted in transit: yes, HTTPS/TLS.
- Users can request/delete account and associated account data: yes.
- Data deletion web link: add/confirm before production.

## Android auth and feature smoke test checklist

Test on at least one physical Android device before Play production.

- [ ] App cold start opens.
- [ ] Listings load from production API.
- [ ] Buy/rent toggle works.
- [ ] Search/filter works.
- [ ] Map loads and does not crash.
- [ ] Listing detail opens.
- [ ] Listing photo/gallery behavior works.
- [ ] Showing/contact request submits.
- [ ] Price watch request submits as a CRM follow-up request, not automated price notification.
- [ ] Lead-intent prompt behavior works.
- [ ] Email sign-in/sign-up works with Clerk.
- [ ] Google sign-in is hidden unless Android OAuth is intentionally configured and tested.
- [ ] Apple sign-in is hidden on Android.
- [ ] Saved homes save/unsave after sign-in.
- [ ] Request history loads after sign-in.
- [ ] Buyer/Search Profile loads and saves after sign-in.
- [ ] Account deletion works with a disposable test account.
- [ ] Hafa Homes website link opens from More.
- [ ] Deep link scheme does not break app launch.

## EAS build plan

From `mobile/`:

```bash
npm run typecheck
npm run doctor
```

Optional quick Android install build for device smoke testing:

```bash
eas build -p android --profile preview
```

Production Play Store build:

```bash
eas build -p android --profile production
```

For Google Play, use the Android App Bundle (`.aab`) artifact. EAS production Android builds normally produce the correct store artifact.

## First Google Play upload

Expo/EAS notes that Google Play requires the first upload to be manual in Play Console before API-based `eas submit` works.

Manual first-upload path:

1. Build production Android `.aab` with EAS.
2. Download the `.aab` from the EAS build page.
3. Open Play Console → Hafa Homes.
4. Go to Internal testing.
5. Create/select tester list.
6. Create new release.
7. Choose Play App Signing; prefer Google-generated app signing key when prompted.
8. Upload the `.aab`.
9. Add release notes.
10. Save/publish to internal testing.
11. Copy internal tester link and install from Google Play on physical Android device.
12. Run smoke checklist.

## Closed testing requirement if using a new personal account

For personal developer accounts created after Nov. 13, 2023:

- Need at least 12 testers opted into closed testing.
- Testers must remain opted-in for 14 consecutive days.
- Google asks for answers about tester engagement, feedback, app value, changes made, and production readiness before granting production access.

If this applies, start the closed test as soon as internal smoke testing passes so the 14-day clock starts.

Tester instructions should ask testers to use:

- search;
- map;
- listing detail;
- saved homes;
- showing/contact request;
- Buyer/Search Profile;
- account deletion only on a disposable account if asked.

## EAS submit setup after first manual upload

After the first manual Play Console upload, configure API-based submissions.

Steps:

1. Create Google Cloud project if needed.
2. Create service account.
3. Create/download JSON key.
4. Enable Google Play Android Developer API.
5. Invite the service account email in Play Console → Users and permissions.
6. Grant app permissions:
   - Release apps to testing tracks.
   - Manage testing tracks and edit tester lists.
   - Release to production if we want future production automation.
7. Upload the JSON key to EAS credentials or keep it in a secure uncommitted path.

Do **not** commit service account JSON.

Example `eas.json` shape after the service account exists:

```json
{
  "submit": {
    "production": {
      "android": {
        "track": "internal",
        "serviceAccountKeyPath": "./google-play-service-account.json"
      }
    }
  }
}
```

Preferred approach for Shimizu:

- Store the key outside the repo or upload to EAS credentials.
- Keep `.gitignore` protecting any `google-play*.json` files.
- Submit to `internal` first, not production.

Submit after setup:

```bash
eas submit -p android --profile production
```

Or build and auto-submit later:

```bash
eas build -p android --profile production --auto-submit-with-profile production
```

## Target API level note

As of Aug. 31, 2025, new Google Play app submissions and updates must target Android 15 / API level 35 or higher. Expo SDK 56 should be current enough, but confirm during the EAS build/Play upload. If Play Console rejects target SDK level, update Expo/React Native or Android build config before proceeding.

## Definition of done

- [ ] Google Play Developer account ready and verified.
- [ ] Hafa Homes app created in Play Console with package `com.shimizutechnology.hafahomes`.
- [ ] Store listing copy complete.
- [ ] App icon, feature graphic, and screenshots uploaded.
- [ ] Privacy policy and deletion URL accepted.
- [ ] Data Safety form complete and consistent with actual app behavior.
- [ ] App access/reviewer account added.
- [ ] Content rating complete.
- [ ] Target audience/children policy complete.
- [ ] Android production `.aab` built successfully.
- [ ] First manual upload to internal testing complete.
- [ ] App installed from Play internal testing on physical Android.
- [ ] Android smoke checklist passes.
- [ ] Closed testing completed if account requires it.
- [ ] Production access granted if required.
- [ ] Production release submitted intentionally.
- [ ] This doc updated with release IDs, build IDs, and final Play Console status.
