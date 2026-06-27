# Android Play Store Release Plan

_Last updated: 2026-06-27. Planned for after PR #18 and the buyer/search profile prompt work._

## Goal

Ship Hafa Homes on Google Play with the same production quality as the approved iOS app.

This is not part of PR #18 and should not block the buyer/search profile follow-up. It should happen soon after the product is in a stable demo/production state.

## Current project configuration

Expo/EAS project:

```text
@shimizutechnology/hafa-homes
EAS project ID: d1d219fa-fb79-47c5-9dc2-339645c6b00a
```

Android package already configured in `mobile/app.json`:

```text
com.shimizutechnology.hafahomes
```

Current Android config includes:

- adaptive icon assets;
- deep link scheme `hafahomes://`;
- production EAS profile with auto-increment;
- Clerk/mobile auth already implemented for iOS and Android-capable Expo runtime.

## Required accounts and one-time setup

- [ ] Create/confirm Google Play Developer account for Shimizu Technology.
  - One-time registration fee.
  - Use the right company/legal profile before publishing.
- [ ] Create the Hafa Homes app in Google Play Console.
- [ ] Set package name exactly:

```text
com.shimizutechnology.hafahomes
```

Package names cannot be changed after release.

## Store listing checklist

Prepare Google Play listing assets:

- [ ] App name: `Hafa Homes`.
- [ ] Short description.
- [ ] Full description.
- [ ] App icon, already present in Expo assets but verify Play requirements.
- [ ] Feature graphic.
- [ ] Phone screenshots.
- [ ] 7-inch/10-inch tablet screenshots if required by current Play policy or if tablet support is enabled.
- [ ] App category: likely House & Home or Lifestyle; confirm best fit.
- [ ] Contact email and website:

```text
https://hafahomes.com
```

- [ ] Privacy policy URL:

```text
https://hafahomes.com/privacy
```

Do not claim live MLS/Flexmls data until authorization/compliance is complete.

## Policy/forms checklist

Complete Play Console declarations carefully:

- [ ] Data Safety form.
  - Account/profile data.
  - Contact info.
  - App activity/search intent if applicable.
  - Location: only if the app requests device location. If not requesting device GPS, do not claim location collection.
- [ ] Ads declaration: likely no ads.
- [ ] App access instructions.
  - Public browsing works without login.
  - Provide a demo/test account only if Google needs to test signed-in flows.
- [ ] Content rating questionnaire.
- [ ] Target audience/children policy: not directed to children.
- [ ] News/financial/health declarations as applicable: likely no.
- [ ] Delete account/data disclosure.
  - App has account deletion flow; verify Android build exposes it the same way as iOS.

## Auth and Android-specific smoke tests

Before submitting, test on at least one physical Android device and one emulator if possible:

- [ ] App opens from cold start.
- [ ] Listings load from production API.
- [ ] Search/filter works.
- [ ] Map works and Mapbox token is present in EAS production env.
- [ ] Listing detail opens.
- [ ] Save/unsave homes works after sign-in.
- [ ] Clerk sign-in/sign-up works.
- [ ] Google sign-in only if intentionally enabled and configured for Android.
- [ ] Apple sign-in is not expected on Android.
- [ ] Showing request submits.
- [ ] Price alert submits.
- [ ] Progressive prompt behavior works.
- [ ] Account screen loads.
- [ ] Account deletion works from a disposable test account.
- [ ] Deep link scheme does not break app launch.

## EAS build and submit plan

From `mobile/`:

```bash
npm run typecheck
npm run doctor
```

Create an Android production build:

```bash
eas build -p android --profile production
```

For first Play upload, use an Android App Bundle (`.aab`). EAS production Android builds normally produce the correct store artifact.

Recommended first rollout path:

1. Internal testing track.
2. Closed testing track if Google requires it for the account/app type.
3. Production rollout at a low percentage only after smoke testing.

## Google Play signing

Use Play App Signing unless there is a strong reason not to.

Important:

- Let EAS manage Android signing credentials unless we intentionally decide otherwise.
- Store/recovery docs for keystore credentials should stay private and never be committed.
- Confirm the EAS project and Google Play app are linked to the same package name before first upload.

## EAS submit setup

After the Play Console app exists, add Android submit config to `mobile/eas.json`.

Example shape:

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

Do **not** commit the service account JSON. Store it outside the repo or use EAS credentials/secrets.

Submit:

```bash
eas submit -p android --profile production
```

## Release sequencing recommendation

Do this after:

1. PR #18 is merged and deployed.
2. Buyer/search profile prompt follow-up is done or at least scoped out enough that Android does not launch immediately before a major account-flow change.
3. Production API/web/mobile env vars are stable.
4. Android physical-device smoke passes.

## Definition of done

- [ ] Google Play app created under the correct developer account.
- [ ] Store listing and policy forms complete.
- [ ] Android production EAS build succeeds.
- [ ] Internal testing release uploaded.
- [ ] Physical Android smoke test passes from internal track.
- [ ] Account deletion verified on Android.
- [ ] Data Safety answers match actual app behavior.
- [ ] Production rollout started intentionally.
- [ ] `docs/app-store-release.md` or this doc updated with final build/release IDs.
