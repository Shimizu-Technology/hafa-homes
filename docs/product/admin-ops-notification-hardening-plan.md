# Admin Operations, Audit, and Notification Hardening Plan

_Last updated: 2026-06-10 after App Store build `1.0.1 (9)` resubmission and QA findings._

## Purpose

This plan captures the product/admin gaps found during live testing after the account-deletion App Store build. These items are legitimate and should be handled before or alongside the next broker-demo push because they affect broker trust, admin operations, lead follow-up, and consumer conversion.

This is a hardening layer between the current broker CRM foundation and the full domain-first broker-branded platform work.

## Current code reality reviewed

### Admin user management

Current state:

- Rails has `User`, roles, invitation-related columns, and `Admin::UsersController#index/update`.
- Web `/admin/users` can list users and update role, brokerage membership, and linked agent profile.
- API routes only expose `GET/PATCH /api/v1/admin/users`.
- There is no admin-created user/invite flow yet.
- There is no user archive/revoke flow yet.
- `users.clerk_id` is required, so a proper admin-created user flow must either create/invite through Clerk or create a safe pending local user that is accepted when the Clerk identity signs in.

Conclusion: **legit gap**. Broker/platform admins need self-service user lifecycle management.

### Audit logs/history

Current state:

- `LeadActivity` records lead-specific history for CRM events.
- There is no global audit log for admin/user/listing/account/system actions.
- There is no admin audit-log page.

Conclusion: **legit gap**. Lead activity is not enough for a broker/admin platform.

### Consumer/admin option parity

Current state:

- Admin lead edit supports preferred time values: `morning`, `afternoon`, `evening`, `flexible`.
- Web consumer showing request only shows `morning`, `afternoon`, `evening`.
- Mobile consumer showing request only shows `morning`, `afternoon`, `evening`.
- API currently accepts `preferred_time` as a string without a central enum.

Conclusion: **legit bug**. Options should be shared and consistent across API, web, mobile, and admin.

### Notification links / app-first behavior

Current state:

- Mobile has a custom scheme: `hafahomes`.
- Emails/SMS use web URLs like `/account/requests`.
- There is no universal-link/app-link setup for opening the native app first and falling back to web.
- Mobile does not have deep-link routing for request/listing/admin targets beyond OAuth callback usage.

Conclusion: **legit gap**. Consumer notifications should open the installed app when possible and fall back to web.

### Duplicate greeting in manual emails

Current state:

- The email template always renders `Hi <name>,`.
- The admin manual notification default body also starts with `Hi <name>, ...` for consumer emails.
- When sent as an email, this creates a duplicate greeting.

Conclusion: **legit bug**. Admin-authored body copy should not duplicate the template salutation.

### Phone number on account creation/profile

Current state:

- Mobile email sign-up collects first name, last name, email, and password.
- Web sign-in/sign-up uses Clerk modal defaults.
- Rails `users` table does not have profile phone or preferred-contact fields.
- Showing-request forms collect phone separately and only prefill signed-in name/email today.

Conclusion: **legit gap**. Account profile should support optional phone/preferred contact and use those values to prefill lead forms.

## Recommended implementation sequence

### PR A — Consumer profile/settings and form parity

Recommended branch:

```bash
feature/consumer-profile-settings
```

Scope:

- Add safe user profile fields in Rails:
  - `phone`
  - `preferred_contact_method`
  - optional future `notification_preferences` JSON if needed later.
- Add `GET/PATCH /api/v1/me` profile support for safe fields only.
- Do **not** allow `role`, brokerage membership, tenant, agent assignment, or admin fields through `/me`.
- Add mobile **Profile & settings** screen.
- Update web `/account` to match.
- Let users add/edit phone and preferred contact.
- Prefill showing/contact forms with signed-in user name, email, phone, preferred contact.
- Add `flexible` preferred-time option to consumer web and mobile.
- Prefer shared constants/options so admin and consumer forms cannot drift again.

Acceptance criteria:

- Signed-in mobile/web users can update phone/preferred contact.
- Showing requests prefill name/email/phone/contact method from profile.
- Public browsing remains unauthenticated.
- Public showing requests still work without sign-in.
- `preferred_time=flexible` is available on consumer web, mobile, and admin.
- Mobile typecheck, mobile doctor, web build, and API smoke pass.

### PR B — Notification link and copy polish

Recommended branch:

```bash
feature/notification-link-polish
```

Scope:

- Remove duplicate greeting behavior for manual email body defaults.
- Keep email template responsible for salutation, or support an explicit `body_is_full_html/body_includes_greeting` flag if needed later.
- Add notification CTA helper that builds canonical paths:
  - consumer requests: `/account/requests`
  - listing detail: `/listings/:id`
  - staff lead detail: `/admin/leads/:id`
- Add app-first link strategy:
  - configure iOS Associated Domains for the production web domain once final domain is chosen;
  - configure Android intent filters when Android release begins;
  - add mobile deep-link routing for requests/listings;
  - use normal HTTPS URLs in email/SMS so installed apps open via universal links and non-installed users fall back to web.
- Document fallback behavior for Netlify preview vs final production domain.

Notes:

- Custom scheme links like `hafahomes://requests` can be useful internally, but email/SMS should generally use HTTPS universal links for reliable fallback.
- Domain-first broker sites may need broker-specific app-link handling later; start with Hafa Homes first.
- Hafa Homes uses `applinks:hafahomes.com`; `www.hafahomes.com` is intentionally excluded because it redirects instead of serving the association file directly. The legacy `/open?target=` route remains available for already-sent links.

Acceptance criteria:

- Manual email no longer says `Hi Leon` twice.
- Consumer notification CTA opens request history on web fallback.
- Installed app can handle request/listing deep links once associated-domain setup is active.
- SMS stays short and uses the same canonical link strategy.

### PR C — Admin user lifecycle management

Recommended branch:

```bash
feature/admin-user-lifecycle
```

Scope:

- Add admin-created user/invite flow.
- Add `POST /api/v1/admin/users`.
- Add archive/revoke/update lifecycle endpoints or `PATCH` fields.
- Add user status/lifecycle fields if needed:
  - `status` or `archived_at` / `archived_by_id`
  - `revoked_at`
  - `last_invited_at` or use existing `invited_at`
- Decide Clerk strategy:
  - preferred: create Clerk invitation/user via `CLERK_SECRET_KEY` when admin invites a user;
  - fallback: create pending local user by email, then accept/link when Clerk sign-in occurs.
- Allow platform admins to create:
  - platform admins
  - brokerage admins
  - agents
  - consumers
- Later allow brokerage admins to invite users only within their brokerage/tenant.
- Support linking/creating an `Agent` profile during staff creation.
- Support membership status changes: active/invited/inactive/revoked.
- Add resend invite action if Clerk invitations are used.
- Add archive/reactivate instead of hard-deleting staff/consumer records by default.

Security rules:

- Only platform admins can create platform admins.
- Brokerage admins cannot elevate users outside their brokerage.
- Consumers cannot be created with staff roles through public endpoints.
- Do not expose Clerk secret operations to clients.
- Do not hard-delete users who have lead/CRM/audit history unless using the existing self-service account deletion path.

Acceptance criteria:

- Platform admin can create invited staff/consumer users from `/admin/users`.
- Platform admin can edit names, roles, memberships, linked agents, and archive/reactivate users.
- Archived users cannot access staff/admin functionality.
- Existing Clerk sign-in can accept/link invited local users by email.
- Relevant audit events are recorded.

### PR D — Global audit log/history

Recommended branch:

```bash
feature/admin-audit-log
```

Scope:

- Add `AuditEvent` model/table.
- Add central service, e.g. `AuditLogger.record!`.
- Add scoped admin API:
  - `GET /api/v1/admin/audit_events`
  - filters by actor, action, target type, target id, brokerage, date range.
- Add admin UI page under something like `/admin/audit`.
- Capture:
  - user created/invited/updated/archived/reactivated
  - role/membership changes
  - lead status/assignment/contact changes
  - showing created/updated/cancelled
  - note/task created/edited/archived/completed
  - notification queued/sent/skipped/failed/manual send
  - listing/brokerage/agent changes when those admin editors exist
  - profile update/account deletion events
  - saved/unsaved listing and saved-search events if useful for customer-intent history

Recommended fields:

```text
actor_id
actor_email snapshot
action
target_type
target_id
target_label snapshot
brokerage_id optional
lead_id optional
request_id/correlation_id optional
ip_address optional
user_agent optional
metadata jsonb
changes jsonb
created_at
```

Security/privacy rules:

- Do not store secrets, raw tokens, passwords, full auth headers, or provider credentials.
- Mask phone numbers where full values are not needed.
- Keep consumer-visible request history separate from internal audit history.
- Tenant-scope brokerage admins/agents to only their authorized events.

Acceptance criteria:

- Platform admin can see a global audit log.
- Brokerage admins can see their brokerage's events only.
- Lead detail can still show lead-specific timeline; global audit can link back to records.
- User lifecycle changes produce audit events.

## Updated product priority

These QA findings should slightly reorder the next work:

1. App Store review monitoring and production env check (`CLERK_SECRET_KEY`).
2. Consumer profile/settings with phone + preferred-contact profile fields.
3. Quick consumer/admin form parity and duplicate notification-greeting fix.
4. Admin user lifecycle management.
5. Global audit log/history.
6. Domain-first broker-branded website/app foundation.
7. Lead quality/verification/scoring and speed-to-lead automation.
8. Saved searches/alerts and notification preferences.
9. Property-management premium-tier preview.
10. MLS/Flexmls/GAR integration after authorization.

Reasoning:

- Profile/settings and phone prefill improve consumer UX and App Store polish.
- Option parity and notification copy fixes are small but visible quality bugs.
- Admin user lifecycle and audit logs are critical before serious broker pilots because broker admins need to manage their own people and trust the system history.
- Domain-first broker branding is still the next major platform differentiator, but it will demo better once admin operations are credible.
