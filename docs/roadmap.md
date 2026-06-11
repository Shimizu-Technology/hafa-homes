# Roadmap

_Last updated: 2026-06-10 after PR #11 account deletion merged, iOS build `1.0.1 (9)` submitted, and admin/notification QA findings were documented._

## Current product direction

Hafa Homes is now a broker-first Guam real estate platform, not only a consumer listing demo.

The intended sellable bundle is:

```text
broker-branded website + broker-branded app option + lead CRM + future property-management portal
```

Hafa Homes remains the demo/reference public brand and possible Guam marketplace layer.

## Completed phases

### Phase 0 — Planning and validation

Status: complete.

Completed:

- project name and repo
- product/research docs
- Locations LLC inspiration research
- Guam-first MVP scope
- broker-first strategy after Mike/John discussions
- Real Geeks competitive framing after broker feedback

### Phase 1 — PWA demo

Status: complete enough for demo; ongoing polish.

Completed:

- React/Vite public web app
- mobile-first Hafa Homes UI
- home/search/listing surfaces
- buy/rent filters
- sample Guam listings
- listing detail pages
- Local Intel
- lead capture forms
- hosted Netlify demo historically available

### Phase 2 — Native mobile foundation

Status: complete enough for TestFlight/demo; ongoing polish.

Completed:

- Expo app under `/mobile`
- EAS project configured
- iOS bundle ID registered
- TestFlight build historically created and installable
- mobile listing browse/detail/search/map flows
- saved homes after sign-in
- request/showing forms
- mobile request history

### Phase 3 — Auth and consumer accounts

Status: complete.

Completed in PR #7:

- Clerk auth across Rails API, web, and mobile
- Rails `User` model
- roles: platform admin, brokerage admin, agent, consumer
- server-backed saved listings
- signed-in lead/user association
- protected admin/staff access foundation

### Phase 4 — Broker platform foundation

Status: complete.

Completed in PR #8:

- `Brokerage`
- `Agent`
- `BrokerageMembership`
- listing brokerage/agent attribution
- lead brokerage/agent attribution
- role/tenant-scoped staff lead access
- broker/admin lead inbox/detail
- lead status and assignment updates

### Phase 5 — Requests, showings, admin parity

Status: complete.

Completed in PR #9:

- `ShowingAppointment`
- consumer request history
- web/mobile requests surfaces
- admin dashboard/users/showings
- scheduling workflow
- safer staff scoping
- web/mobile listing detail parity
- notification delivery foundation
- Guam phone normalization

### Phase 6 — Broker CRM expansion

Status: complete.

Completed in PR #10:

- lead notes
- lead tasks/reminders
- lead activity timeline
- note/task edit and archive
- source/campaign fields
- CRM summary counts
- paginated CRM history endpoints
- expandable activity change details
- responsive CRM workspace on lead detail

## Immediate release track

Current App Store state:

```text
iOS version 1.0.1
build 9
status: Waiting for Review
```

Build `9` includes the PR #11 self-service account deletion flow. Keep production `CLERK_SECRET_KEY` configured so Apple can test deletion if needed.

See `docs/app-store-release.md`.

## Active next product phase

### Phase 7 — Account, admin operations, audit, and notification hardening

Recommended branches:

```bash
feature/consumer-profile-settings
feature/notification-link-polish
feature/admin-user-lifecycle
feature/admin-audit-log
```

Goal:

> Clean up the account/admin/notification gaps found in testing so the platform feels operationally credible before serious broker demos.

Recommended scope:

- Profile & settings on mobile/web.
- Safe profile fields: first name, last name, phone, preferred contact.
- Signed-in lead-form prefill from user profile.
- Consumer/admin preferred-time parity, including `Flexible`.
- Notification duplicate-greeting fix.
- App-first notification/deep-link strategy with web fallback.
- Admin-created users/invites for admins, agents, and consumers.
- User edit/archive/reactivate/revoke lifecycle.
- Global audit log/history with tenant-scoped admin visibility.

See `docs/product/admin-ops-notification-hardening-plan.md`.

## Upcoming phases

### Phase 8 — Domain-first broker-branded website/app foundation

Recommended branch:

```bash
feature/broker-domain-foundation
# or broader:
feature/broker-branded-sites-apps
```

Goal:

> Prove that the same platform can power brokerage-specific customer-facing experiences.

Recommended scope:

- `BrokerageDomain` and host-based tenant resolution
- brokerage branding config
- brokerage public homepage/profile on broker-owned domains
- brokerage-scoped listing/search page
- agent roster/profile pages
- brokerage-routed lead forms
- slug preview fallback for local/dev/demo only
- “Powered by Hafa Homes” footer option
- Expo/EAS broker-branded app configuration plan

See `docs/product/broker-branded-layer-plan.md`.

### Phase 9 — Lead quality / CRM automation

Goal: improve broker confidence in lead quality and follow-up accountability.

Potential scope:

- duplicate lead detection
- phone/email verification badges
- saved-search/listing activity scoring
- speed-to-lead reminders
- notification preferences
- CSV export
- agent follow-up reporting

### Phase 10 — Property management preview

Goal: demo premium-tier rental/property-management value for Guam brokerages/property managers.

Potential scope:

- managed properties
- tenant list
- lease/date placeholders
- rent status placeholder
- maintenance request preview
- owner/tenant portal concept

### Phase 11 — Production deployment and demo hardening

Goal: make the latest platform safe and smooth to demo from production URLs/devices.

Potential scope:

- deploy latest API
- run production migrations
- verify background jobs
- deploy latest web
- refresh TestFlight/mobile config
- demo accounts and seed data
- notification gates/config verification
- App Store/TestFlight notes update

### Phase 12 — MLS/Flexmls integration path

Start only after authorization/compliance is clear.

Potential scope:

- provider adapter interface
- normalized listing payload
- feed/source models
- sync run logging
- attribution/disclaimer fields
- dry-run importer using authorized sample data

## Parallel discovery track

Keep these discovery conversations moving while product work continues:

- Carl / MLS committee: Flexmls/GAR/vendor/compliance path.
- Clare Delgado / Home Ventures: Real Geeks usage, broker pain, property-management workflows.
- Bawar / GAR: association/political landscape and broker introductions.
- First pilot brokerage: feed authorization, package/pricing feedback, demo validation.

## Business packaging work

Mike/John/Leon should continue shaping:

1. Tier 1 — Brokerage Website/App/Search.
2. Tier 2 — Engagement/Lead CRM.
3. Tier 3 — Property Management/Tenant Portal.

Open decisions:

- setup fee range
- monthly subscription range
- per-agent seat logic
- broker-owned domain onboarding/support
- broker-branded app pricing/support
- first pilot discount or beta package
- operating/entity structure for SSI Automation / Shimizu Technology collaboration
