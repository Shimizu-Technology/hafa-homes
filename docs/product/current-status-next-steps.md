# Hafa Homes Current Status and Next Steps

_Last updated: 2026-06-10 after PR #10 (broker CRM expansion) merged to `main`._

## Source context

Product direction comes from the repo docs plus Leon/Mike/John notes:

- `docs/product/product-brief.md`
- `docs/product/platform-strategy.md`
- `docs/product/brokerage-platform-plan.md`
- `docs/product/white-label-brokerage-platform-plan.md`
- `docs/meetings/2026-06-01-ssi-automation-hafa-homes.md`
- `docs/meetings/2026-06-05-broker-feedback-realgeeks.md`
- `docs/research/realgeeks-competitive-analysis.md`
- Brain-Dump: `work/shimizu-tech/Michael Sazaki (BOH)/2) Talk with Mike about HafaHomes and Shimizu Technology - May 24, 2026.md`
- Brain-Dump: `work/shimizu-tech/SSI-Automation/1) 1st Meeting with Mike and John for SSI Automation.md`
- Brain-Dump: `work/shimizu-tech/JMI-John-Ilao/2) Meeting with John about the Dispatch App.md`

Key strategic signal:

> Hafa Homes should be sold broker-first as a Guam-first brokerage website/app/CRM platform, not only as a generic consumer listing app.

Mike and John’s notes point toward a Real Geeks-style bundle adapted for Guam: broker-branded website, broker-branded app option, lead CRM, showing/contact workflows, and future property-management/tenant tooling. Hafa Homes remains the demo/reference brand and possible public marketplace layer.

## Where we are now

Hafa Homes is no longer just a cool listing demo. The latest `main` has a real broker-platform foundation:

- consumer web/PWA
- Expo native mobile app
- Clerk auth and roles
- broker/agent tenancy
- server-backed saved homes
- public showing/lead capture
- consumer request history
- staff/admin scheduling
- safe notification logging/sending foundation
- broker/admin CRM notes, tasks, and activity timeline

Current main commit after PR #10:

```text
7b35050 Merge pull request #10 from Shimizu-Technology/feature/broker-crm-expansion
```

## Shipped / working

### Consumer surfaces

- Public web/PWA search and listing detail surfaces.
- Expo native app under `/mobile`.
- Buy/rent flows, map/list browsing, listing detail, Local Intel, mortgage calculator, saved listings, and showing requests.
- Public browsing remains unauthenticated.
- Saved homes require sign-in and are server-backed.
- Showing requests remain low-friction and public, while signed-in requests attach `user_id` server-side.
- Consumer request history exists on web/mobile and hides internal CRM records.

### Auth / roles

- Clerk-backed auth across Rails API, React web, and Expo mobile.
- Rails owns product authorization and tenancy.
- Roles:
  - `platform_admin`
  - `brokerage_admin`
  - `agent`
  - `consumer`
- Staff/admin routes are protected and tenant-scoped.

### Broker platform foundation

- `Brokerage`
- `Agent`
- `BrokerageMembership`
- Listings can belong to brokerages and agents.
- Leads can belong to brokerages and assigned agents.
- Staff lead access is scoped by role/tenant.
- Agents default to assigned/scoped leads.
- Public lead creation cannot spoof `user_id`, `brokerage_id`, or `assigned_agent_id`.

### Requests, scheduling, and admin parity

- `ShowingAppointment` model and API.
- Consumer `GET /api/v1/me/leads` request history.
- Staff showing appointment create/update/index.
- Admin dashboard, users, showings, and lead detail workflows.
- Collapsible desktop admin sidebar and mobile admin drawer.
- Admin/public navigation preserves context when opening public listings from a lead.

### CRM expansion merged in PR #10

- `LeadNote` for internal notes.
- `LeadTask` for follow-up tasks/reminders.
- `LeadActivity` for timeline events.
- Edit/archive support for notes and tasks.
- Archived CRM records are hidden by default.
- Activity timeline supports expandable change details.
- Source/campaign fields on leads:
  - `source_campaign`
  - `source_url`
- CRM summary metrics:
  - open tasks
  - overdue tasks
  - completed tasks
  - archived tasks
  - active notes
  - archived notes
  - activity count
- Paginated staff endpoints:
  - `GET /api/v1/leads/:lead_id/notes`
  - `GET /api/v1/leads/:lead_id/tasks`
  - `GET /api/v1/leads/:lead_id/activities`
- Responsive web CRM workspace optimized for mobile and desktop.

### Notification foundation

- `NotificationDelivery` logs notification attempts.
- Resend email and ClickSend SMS are supported behind explicit env gates.
- Local/dev live sends are off by default.
- Showing schedule/update notifications can queue customer email/SMS and agent email.
- Delivery job atomically claims queued records before provider calls.
- Guam phone normalization is implemented.

## Important limitations / blockers

### MLS / listing data

Real production listing data is still blocked on MLS/Flexmls/GAR authorization and compliance.

Open questions:

- Can Hafa Homes be approved as a vendor/app for participating Guam brokerages?
- Can one brokerage authorize access, or do multiple brokers each authorize feeds?
- Feed type: IDX, Flexmls IDX, RESO Web API, RETS, CSV/XML, iframe/embed, or another approved method?
- What attribution, disclaimer, refresh, sold/rented status, and photo caching rules apply?

### Production readiness

The latest broker CRM and scheduling migrations/features are merged but still need production deployment/migration verification before relying on them in a live demo.

Before production/demo:

- deploy API
- run production migrations
- verify background jobs
- deploy web
- verify mobile against migrated API
- verify notification gates/config
- refresh TestFlight build if needed

### Notifications

Production sending still requires:

- Resend domain/DNS/API key/from-address setup
- ClickSend production credentials
- live env flags intentionally enabled
- background worker readiness

Future follow-up:

- Resend webhook status updates
- ClickSend delivery receipt sync
- notification preferences

### App Store

- TestFlight exists historically, but current backend/web/mobile parity should be revalidated before a new broker demo build.
- Public App Store release still needs metadata, screenshots, privacy answers, and final submission.
- Broker-specific iOS apps may trigger Apple white-label/template scrutiny. Broker-branded apps may need materially distinct branding and/or broker-owned Apple developer accounts.

## Strategic assessment

### What Hafa Homes can credibly demo now

- A polished Guam-first consumer housing app/web experience.
- Signed-in saved homes.
- Public showing request capture.
- Consumer request history.
- Broker/agent attribution and staff scoping.
- Staff/admin lead inbox and detail.
- Showing scheduling.
- Manual customer/agent notifications with safe delivery logs.
- A real CRM workspace: notes, tasks, activity timeline, edits/archive, source tracking.

### What it cannot honestly claim yet

- Real MLS/Flexmls integration.
- Production-ready broker-branded websites.
- Production-ready broker-branded app builds.
- Full Real Geeks replacement.
- Automated lead verification/scoring/drips.
- Full property-management/tenant portal.

### Product maturity label

Current state:

```text
credible broker-platform demo
```

Not yet:

```text
fully sellable Real Geeks alternative
```

## Immediate operational next step

### Refresh mobile/TestFlight after deploying API

Leon’s preferred next operational move is to get the latest mobile app changes into Apple review/TestFlight before starting the broker-branded build.

Important dependency:

> The mobile app points at the production Rails API, so the production API should be deployed and migrated before submitting a new mobile build for serious review/testing.

Recommended order:

1. Deploy latest Rails API.
2. Run production migrations.
3. Verify production listing/saved/request endpoints.
4. Verify mobile locally against production API.
5. Build iOS with EAS.
6. Submit latest build to App Store Connect/TestFlight.
7. Add Mike/John/testers and testing notes.

See `docs/app-store-release.md`.

## Recommended next product priority

### Next sprint: Domain-first broker-branded website/app foundation

Recommended branch:

```bash
feature/broker-branded-sites-apps
```

Why this is next:

- Mike/John notes imply brokerages may want their own owned-domain website/app experience, not just a listing or slug inside generic Hafa Homes.
- Broker feedback/Real Geeks research says website + app + CRM is the sellable bundle.
- CRM depth is now credible enough to support the broker pitch.
- The next gap is proving the shared platform can power a brokerage-specific public experience.

Recommended PR scope:

- `BrokerageDomain` and host-based tenant resolution.
- Brokerage branding config.
- Brokerage public homepage/profile on broker-owned domains.
- Brokerage-scoped listing/search pages.
- Agent roster/profile pages.
- Brokerage-routed lead/showing forms.
- Slug preview fallback for local/dev/demo only.
- “Powered by Hafa Homes” footer option.
- Expo/EAS broker-branded app configuration plan.
- Documentation for shared backend/shared codebases.

See `docs/product/broker-branded-layer-plan.md`.

## After broker branding

### CRM / lead quality follow-up

- Duplicate lead detection.
- Phone/email verification badges.
- Saved-search/listing activity scoring.
- Speed-to-lead reminders.
- Notification preferences.
- CSV export.
- Agent performance/follow-up reporting.

### MLS/Flexmls discovery

Continue in parallel with:

- Carl / MLS committee
- Clare Delgado / Home Ventures
- Bawar / GAR
- first pilot brokerage

### Property-management preview

After broker branding, build a lightweight premium-tier preview:

- managed properties
- tenant list
- lease/date placeholders
- rent status placeholder
- maintenance request preview
- owner/tenant portal concept

This should be demoable without pretending it is a full management suite.

## Suggested business homework for Mike/John/Leon

- Draft 3 package tiers:
  1. Website/App/Search
  2. Engagement/Lead CRM
  3. Property Management/Tenant Portal
- Draft setup + monthly pricing ranges.
- Build broker discovery target list.
- Prepare Carl/Clare/Bawar questions.
- Decide first broker pilot target.
- Prepare a concise demo script.

## Suggested demo story

1. “Here is Hafa Homes, the reference Guam-first app.”
2. “Here is how a buyer/renter searches, saves, and requests a showing.”
3. “Here is the broker/admin side where the lead lands.”
4. “Here is the CRM follow-up workspace: notes, tasks, timeline, showing schedule, notification history.”
5. “Next, this same platform powers your brokerage-branded site/app.”
6. “MLS/Flexmls access plugs in once your brokerage authorizes the feed.”
