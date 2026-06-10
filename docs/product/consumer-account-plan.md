# Consumer Account, Saves, and Inquiry Plan

_Last updated: 2026-06-10 after PR #11 self-service account deletion work._

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

## Phase 3 — account deletion compliance

Implemented in PR #11.

Why:

- Apple requires apps that allow account creation to also offer in-app account deletion.
- Hafa Homes now supports Clerk sign-in/sign-up on mobile and web, so self-service deletion must be available before App Store review.

Backend behavior:

- `DELETE /api/v1/me` requires authentication.
- Rails deletes the local Hafa Homes user first inside a transaction.
- Synced saved homes are destroyed with the user.
- Consumer leads, showing appointments, CRM activity, notes, tasks, and notification history are preserved for brokerage follow-up/audit, but user foreign keys are nullified.
- After local deletion succeeds, Rails deletes the Clerk identity using `CLERK_SECRET_KEY`.
- If local deletion fails, Clerk is not deleted so the user can retry.
- If Clerk deletion fails after local cleanup, the user can sign in again and retry because Clerk still exists.

UX:

- Mobile: signed-in users can delete their account from the More/account card.
- Web: signed-in users can delete their account from `/account`.
- Destructive flows explain that submitted showing/contact requests remain for brokerage follow-up but are disconnected from the account.

Production requirement:

- `CLERK_SECRET_KEY` must be configured on the Rails API before submitting a replacement App Store build that includes account deletion.

## Phase 4 — proper profile and settings experience

Next consumer-account UX follow-up.

Today, the account/deletion UI is intentionally minimal so App Store compliance is covered quickly. Next, build a proper profile/settings surface rather than keeping all account actions in the More screen card.

Recommended product shape:

- Mobile More tab becomes a resource hub with a clear **Profile & settings** entry.
- Tapping **Profile & settings** opens a dedicated account/settings screen.
- Web `/account` becomes the matching desktop account settings page.
- Delete account moves into a clearly labeled danger zone on the settings page.

Profile/settings scope:

- Profile summary: name, email, sign-in provider/account status.
- Editable safe profile fields: first name, last name, optional phone, preferred contact method.
- Non-editable product role display for staff/admin users.
- Links to saved homes and request history.
- Notification preferences placeholder for future saved-search/showing updates.
- Privacy/account actions: sign out, delete account, privacy policy.

Backend/API likely needed:

- `PATCH /api/v1/me` for consumer-safe profile fields only.
- Do not allow role, brokerage membership, agent assignment, or tenant fields through this endpoint.
- Decide whether email changes should be handled only through Clerk user settings, not Rails.
- Consider adding user profile columns for phone/preferred contact/notification preferences instead of overloading leads.

Acceptance criteria:

- Signed-in mobile users can reach account deletion from More → Profile & settings → Delete account.
- Signed-in web users can reach deletion from `/account`.
- Users can update safe profile fields without affecting Clerk roles or broker tenancy.
- Public browsing remains unauthenticated.
- Saved homes and request history continue to require sign-in.
- API, web build, mobile typecheck, and mobile doctor pass.

## Phase 5 — account-powered search loop

After profile/settings, broker-branded, and demo essentials:

- saved searches
- listing alerts
- inquiry status notifications
- server-backed recent views
- account-based recommendations
- richer brokerage/agent visibility on broker-branded surfaces
