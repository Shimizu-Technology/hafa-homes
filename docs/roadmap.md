# Roadmap

_Last updated: 2026-06-28 after PR #19 buyer/search profile prompt personalization merged._

## Current product direction

Hafa Homes is now a broker-first Guam real estate platform, not only a consumer listing demo.

The intended sellable bundle is:

```text
broker-branded website + broker-branded app option + full-market listing search + qualified lead capture + lead CRM + future property-management portal
```

Hafa Homes remains the demo/reference public brand and possible Guam marketplace layer.

Current canonical next-build plan from the Mike/John meeting:

```text
docs/product/mike-john-next-build-plan.md
```

Android Play Store release plan:

```text
docs/android-play-store-release-plan.md
```

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
build 11
status: approved/live
```

The live build includes native Apple Sign-In and self-service account deletion. Keep production `CLERK_SECRET_KEY` configured so account lifecycle flows continue to work.

See `docs/app-store-release.md`.

## Active next product phase

### Phase 7 — Agent selection and MLS-safe lead routing

Status: complete.

Completed in PR #16:

- public active agents API;
- web Agents page;
- mobile Agents tab;
- sign-in-gated preferred-agent selection;
- `Lead.requested_agent` added;
- `Listing.agent` / `Listing.brokerage` preserved as MLS/listing attribution;
- `Lead.brokerage` treated as routing/app brokerage;
- requested agent validated against the routing brokerage;
- no-preference leads stay unassigned in the brokerage queue;
- admin assigned-agent filtering;
- web/mobile UI copy separates `Listed by` from `Work with` / `Preferred agent`.

See:

- `docs/product/agent-selection-lead-routing-plan.md`
- `docs/product/brokerage-mls-attribution-routing-questions.md`

### Phase 8 — Qualified lead capture

Status: complete.

Completed in PR #17:

- public-safe buyer/renter readiness fields on leads;
- server-derived `quality_score` and Hot/Warm/Early/Unqualified labels;
- web/mobile showing request qualification prompts;
- web/mobile price alert readiness prompts;
- admin qualification cards on lead list/detail;
- consumer-safe readiness summaries without internal CRM notes.

See `docs/product/mike-john-next-build-plan.md`.

### Phase 9 — Progressive lead prompts and first-party intent tracking

Status: complete.

Completed in PR #18:

- first-party lead intent sessions/events;
- listing view, saved home, search/filter, agent selection, form-open, and form-abandon tracking;
- server-side prompt eligibility policy with brokerage-level settings;
- web/mobile progressive search-assist prompts;
- converted prompt leads linked to intent sessions;
- admin CRM intent snapshot showing viewed listings, saved homes, top villages, price range, and trigger context;
- staff-only search intent dashboard;
- anonymous sessions stay anonymous and are not claimed by later signed-in users;
- meaningful intent guardrails before linking sessions to leads.

### Phase 10 — Buyer/search profile settings and prompt personalization

Status: complete.

Completed in PR #19:

- signed-in `BuyerSearchProfile` API;
- web `/account` search profile card;
- mobile account/search profile editor;
- prefill showing, price watch, and search-assist forms from saved profile;
- prompt behavior split:
  - anonymous/no profile -> current qualification prompt;
  - signed-in incomplete profile -> finish profile prompt;
  - signed-in complete profile -> suppress long prompt;
  - behavior divergence -> lightweight update-profile prompt;
- lead snapshots so CRM history reflects answers at submission time;
- profile-first prompts save profile by default and create a CRM lead only when the user explicitly asks for agent follow-up;
- admin lead inbox search/filter/sort and lead-type differentiation;
- privacy guardrail: anonymous intent sessions never transfer into signed-in profiles.

See `docs/product/buyer-search-profile-prompt-plan.md`.

## Upcoming phases

### Phase 11 — Android Play Store release

Goal:

> Ship Hafa Homes on Google Play after PR #18 and buyer/search profile prompt work are stable.

Recommended scope:

- Google Play Developer/Console setup;
- Android production EAS build;
- internal testing track;
- Data Safety and account deletion declarations;
- physical Android smoke testing;
- staged production rollout.

See `docs/android-play-store-release-plan.md`.

### Phase 12 — Domain-first broker-branded website/app foundation

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

### Phase 13 — Lead quality / CRM automation

Goal: improve broker confidence in lead quality and follow-up accountability.

Potential scope:

- duplicate lead detection
- phone/email verification badges
- saved-search/listing activity scoring
- speed-to-lead reminders
- notification preferences
- CSV export
- agent follow-up reporting

### Phase 14 — Property management preview

Goal: demo premium-tier rental/property-management value for Guam brokerages/property managers.

Potential scope:

- managed properties
- tenant list
- lease/date placeholders
- rent status placeholder
- maintenance request preview
- owner/tenant portal concept

### Phase 15 — Production deployment and demo hardening

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

### Phase 16 — MLS/Flexmls integration path

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
