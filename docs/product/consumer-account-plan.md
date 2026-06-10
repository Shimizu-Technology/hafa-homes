# Consumer Account, Saves, and Inquiry Plan

_Last updated: 2026-06-10 after request history and CRM merges._

## Product principle

Keep public browsing open, but require an account for actions that need a durable user identity.

## Phase 1 — current implementation

### Public browsing stays open

Users can browse listings, search, use the map, view listing detail, Local Intel, agents, and mortgage estimates without signing in.

### Header sign-in entry point

The mobile header shows a compact sign-in button when a user is signed out. Signed-in users see an account initial that routes them to the More/account screen.

### Central auth prompt

Mobile uses one shared Clerk sign-in/sign-up modal for:

- header sign-in
- Saved tab CTA
- save/favorite attempts
- More/account screen
- post-inquiry account CTA

Email sign-up collects first/last name so showing requests and future broker workflows have a real contact name. Google SSO uses Clerk's native SSO flow. iOS includes native Sign in with Apple through Clerk Expo and Expo Apple Authentication, with `ios.usesAppleSignIn` enabled for EAS builds. On native mobile, provider buttons are custom UI wired to Clerk strategies rather than Clerk's web drop-in components automatically rendering every enabled provider.

For Clerk Apple OAuth, custom credentials are not required for initial testing, but should be configured before a polished public production release if we want app-owned Apple OAuth/native credential behavior instead of Clerk-managed/shared OAuth behavior.

This avoids fragmented auth UI and keeps Clerk behavior consistent.

### Saved homes require an account

Saving/favoriting a listing now requires sign-in because saved homes need to sync across devices and belong to a real user.

Backend source of truth:

- `saved_listings.user_id`
- `saved_listings.listing_id`
- unique user/listing index

API:

- `GET /api/v1/me/saved_listings`
- `POST /api/v1/listings/:id/save`
- `DELETE /api/v1/listings/:id/save`

Mobile behavior:

- signed out tapping a heart opens the auth prompt
- after sign-in, the originally tapped listing is saved automatically
- Saved tab shows a sign-in CTA until authenticated
- saved homes load from the API, not local device storage
- legacy local saved homes from the pre-auth app are migrated to server-backed saves after the user signs in, then the old local keys are cleared

### Showing requests stay public, but link when signed in

Showing requests should remain low-friction for lead conversion.

- Signed-out users can still submit name/email/phone/message.
- Signed-in users get name/email prefilled from Clerk. If Clerk has no name, the name field stays editable instead of falling back to email.
- If a signed-in user submits, Rails attaches `lead.user_id`.
- If signed out, the lead remains contact-info based with `user_id = nil`.

After a signed-out request succeeds, the app can offer a soft CTA to create an account using the same email.

## Phase 2 — consumer inquiry history

Implemented in PR #9 and merged to `main`.

UX:

- Web: `/account/requests` with `/requests` as a friendly alias
- Mobile: dedicated bottom-tab `Requests` screen
- Consumer-safe statuses such as request received, agent follow-up started, showing scheduled, still searching, and request closed.
- Listing context for each inquiry.
- Agent/broker contact context once assigned.
- Showing appointment date/time/location/details when admin schedules a showing.

Backend approach:

- `GET /api/v1/me/leads` shows signed-in users their own `leads.user_id` records.
- The consumer serializer strips internal CRM details and notes.
- Signed-out historical claiming by verified email remains future work.

Do not block showing requests behind account creation unless abuse/spam becomes a problem. For real estate, low-friction inquiry capture is more valuable than forcing consumer auth too early.

## Phase 3 — account-powered search loop

After broker-branded and demo essentials:

- saved searches
- listing alerts
- inquiry status notifications
- server-backed recent views
- account-based recommendations
- richer brokerage/agent visibility on broker-branded surfaces
