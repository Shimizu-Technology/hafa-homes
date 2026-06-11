# Hafa Homes White-Label Brokerage Platform Plan

_Last updated: 2026-06-10 after PR #11 account deletion/App Store resubmission and admin/notification QA findings._

## Strategic decision

Hafa Homes should remain the demo/reference product, but the bigger business should be a **white-label-capable brokerage platform**.

In practice:

- Hafa Homes is the product demo and possible public Guam discovery app.
- The same platform can power broker-specific websites.
- The same Expo codebase can produce broker-specific iOS/Android app builds.
- The same Rails API/admin can support broker/agent lead workflows, CRM, and future property-management features.

Positioning:

> Hafa Homes is the Guam-first real estate platform that powers brokerage websites, brokerage apps, lead CRM, and local property search experiences.

## Why the plan changed

Mike and John spoke with real estate contacts and received two important signals:

1. Many brokers use or know Real Geeks.
2. Brokers may want the website taken over too, because a standalone app next to an unrelated existing website splits branding, search, and lead workflows.

That means the real broker question is not:

> “Can Hafa Homes be an app brokers subscribe to?”

It is:

> “Can Hafa Homes become the connected website/app/CRM layer for a brokerage?”

## Product model

### Hafa Homes demo/public layer

Purpose:

- Show what the platform can do.
- Validate consumer UX.
- Provide a public App Store/TestFlight presence.
- Let Mike/John demo a polished app before a broker commits.
- Potentially remain a public Guam discovery app if MLS/compliance allows.

### Brokerage website layer

Brokerage customers may get their own branded public website:

- `brokerage.com`
- `search.brokerage.com`
- `brokerage.hafahomes.com`

Website capabilities:

- broker-owned domain support as the primary product path
- homepage / broker brand story
- IDX/listing search once authorized
- listing detail pages
- agent roster/profile pages
- neighborhood/village pages
- buyer/seller/renter guide pages
- property-management page
- lead/contact/showing forms
- seller valuation form later
- market report signup later
- compliance/disclaimer blocks per MLS rules

### Brokerage app layer

Brokerage customers may get their own app-store app:

- same Expo codebase
- different app name/icon/colors
- broker-specific default tenant
- own bundle ID/package name
- own App Store listing if needed

Examples:

- Hafa Homes
- Home Ventures app
- Broker A app
- Broker B app

The app should not be a separate codebase per broker.

### Broker CRM/admin layer

The web admin should be the primary serious admin surface.

CRM/admin capabilities:

- lead inbox
- lead statuses
- lead assignment/routing
- lead detail with listing/search context
- notes
- tasks/reminders
- activity timeline
- saved homes/searches per consumer
- agent performance/follow-up reporting later
- CSV export
- notification settings

Mobile admin should be lightweight:

- lead notifications
- quick lead view
- call/text/email actions
- status update
- note/task add

## Architecture recommendation

### Recommended architecture

Use one shared platform backend and codebase family:

```txt
Rails API / platform backend
  - shared multi-tenant database initially
  - brokerage, agent, listing, lead, CRM, feed, branding, subscription models
  - tenant scoping and authorization

Web/admin app
  - platform admin
  - brokerage admin
  - agent CRM workflows
  - Hafa Homes public/admin surfaces for now

Broker website layer
  - tenant-aware branded public sites
  - likely SEO-oriented framework later if needed

Expo mobile app
  - one codebase
  - Hafa Homes app build
  - broker-branded app builds via EAS profiles/config
```

### Why not separate full stacks per broker?

Avoid separate Rails APIs, databases, and codebases for every broker at the start.

Problems with one full stack per broker:

- duplicated bug fixes
- duplicated migrations
- duplicated auth/security work
- duplicated MLS adapter work
- higher hosting cost
- harder reporting/analytics
- harder platform admin support
- slower product iteration

### When separate infrastructure could make sense

For a large enterprise broker later, we can consider:

- dedicated database
- dedicated API deployment
- stricter data isolation
- custom SLA/support

But that should be an enterprise tier, not the default architecture.

## Tenancy model

Add these concepts:

### Brokerage

Represents a broker/company/office.

Fields/concepts:

- name
- slug
- status
- subscription tier
- primary contact
- phone/email
- website/domain
- compliance/disclaimer settings
- branding/theme config
- MLS/feed config

### BrokerageDomain

Maps broker-owned domains/subdomains to a brokerage tenant. This should be the primary broker-facing routing model. Slugs are retained for previews/local development, but final broker sites should use domains they own.

Examples:

- `homeventuresguam.com`
- `www.homeventuresguam.com`
- `search.homeventuresguam.com`
- `empirerealtyguam.com`

### BrokerageBranding

Controls customer-facing brand:

- logo
- icon
- primary color
- accent color
- typography preference later
- app display name
- homepage copy
- CTA language

### Agent

Represents an agent/realtor within a brokerage.

Fields/concepts:

- brokerage_id
- user_id optional
- name
- email/phone
- license number if needed
- photo
- bio
- status

### BrokerageMembership

Connects users to brokerages and roles.

Roles/scopes:

- platform_admin: all brokerages
- brokerage_admin: brokerage-level management
- agent: assigned brokerage/lead/listing workflows
- consumer: public account

### Listings

Listings should belong to brokerage and optionally an agent:

- `listing.brokerage_id`
- `listing.agent_id`
- feed/source metadata
- attribution/disclaimer metadata

### Leads

Leads should be routed and owned:

- `lead.brokerage_id`
- `lead.assigned_agent_id`
- `lead.user_id` for consumer account when available
- `lead.listing_id`
- `lead.source`
- `lead.status`
- `lead.quality_status`
- `lead.last_contacted_at`

### LeadActivity

Tracks consumer/broker/agent activity. Implemented timeline events include:

- lead created/updated
- showing appointment created/updated
- notification queued/sent/failed/skipped
- note added/updated/archived
- task created/updated/completed/reopened/archived

Future events can include listing viewed, listing saved, saved-search activity, phone/email verification, and automated follow-up reminders.

### LeadTask / LeadNote

CRM primitives now implemented:

- follow-up task
- due date
- assigned user
- completion/reopen/archive
- internal note body
- note edit/archive
- default-hidden archived records

## Data isolation and authorization

Rules:

- platform admins can see all brokerages.
- brokerage admins can see only their brokerage data.
- agents can see assigned leads/listings and brokerage-approved shared leads.
- consumers can see their own saved listings, searches, and eventually inquiries.
- every admin query must be scoped by brokerage unless platform admin.

This is more important than UI. The Rails API must enforce scoping.

## Suggested implementation phases

### Phase 0 — auth/accounts foundation

Completed in PR #7:

- Clerk auth across API/web/mobile.
- User model and roles.
- Server-backed saved listings.
- Lead/user association when signed in.
- Protected admin route foundation.

### Phase 1 — broker platform foundation

Status: completed in PR #8.

Included:

- Brokerage model.
- Agent model.
- BrokerageMembership model.
- Listing brokerage/agent fields.
- Lead brokerage/agent fields.
- Seeded Hafa Homes demo brokerage and sample agents.
- APIs include brokerage/agent attribution.
- Role/tenant authorization on staff/admin endpoints.
- Lead inbox/detail.
- Lead status and assigned-agent updates.

### Phase 1.5 — requests, showings, admin parity

Status: completed in PR #9.

Included:

- consumer request history.
- showing appointments and admin scheduling.
- admin dashboard/users/showings.
- notification delivery foundation.
- public/mobile parity improvements.

### Phase 1.75 — CRM expansion

Status: completed in PR #10.

Included:

- lead notes.
- lead tasks/reminders.
- activity timeline.
- edit/archive controls.
- source/campaign tracking.
- paginated CRM history endpoints.
- responsive CRM workspace on lead detail.

### Phase 1.8 — account/admin/notification hardening

Recommended next branches:

```bash
feature/consumer-profile-settings
feature/notification-link-polish
feature/admin-user-lifecycle
feature/admin-audit-log
```

Scope:

- profile/settings with phone and preferred contact.
- signed-in showing/contact form prefill.
- consumer/admin form parity, including `Flexible` preferred time.
- notification duplicate-greeting fix.
- app-first notification links with web fallback.
- admin-created users/invites for admins, agents, and consumers.
- user edit/archive/reactivate/revoke lifecycle.
- global admin audit log/history.

See `docs/product/admin-ops-notification-hardening-plan.md`.

### Phase 2 — broker branding / website foundation

Recommended branch:

```bash
feature/broker-domain-foundation
# or broader:
feature/broker-branded-sites-apps
```

Scope:

- `BrokerageDomain` host-based tenant routing.
- slug preview fallback for local/dev/demo.
- branded homepage config.
- brokerage listing search page on broker-owned domains.
- agent roster/profile pages.
- lead forms that route to brokerage by resolved tenant.
- compliance/disclaimer area.
- initial “Powered by Hafa Homes” footer option.
- shared Expo/EAS app branding configuration plan.

Note: for SEO-heavy public sites, evaluate moving broker websites to Next.js/Astro later. Keep the current Vite web app for dashboard/admin and demo until the need is proven.

### Phase 3 — broker-branded app builds

Scope:

- tenant config file or remote app config.
- EAS build profiles per broker.
- broker-specific app name/icon/colors.
- bundle ID/package naming pattern.
- app-store metadata template.
- support process for updates.
- Apple white-label/template review strategy.

### Phase 4 — lead quality and CRM automations

Scope:

- phone/email verification.
- verified lead badge.
- duplicate lead detection.
- SMS/email notifications to agents.
- speed-to-lead reminders.
- saved-search/listing activity scoring.
- simple drip workflows later.

### Phase 5 — property management / rental premium tier

Scope:

- managed properties
- tenants
- leases/files placeholders
- rent status
- maintenance request preview
- owner/tenant portal later

## Broker discovery targets

### Carl

Why:

- MLS committee context.
- Can explain Flexmls/GAR/MLS constraints.

Ask him:

- How Real Geeks connects to MLS/Flexmls in Guam.
- What Hafa Homes needs to be approved as a vendor/app.
- What compliance/disclaimer/photo rules apply.

### Clare Delgado / Home Ventures

Why:

- Long-time market insight.
- Likely understands broker pain, lead quality, and property-management/rental operations.

Ask her:

- What tools brokers actually use daily.
- What Real Geeks does well/poorly.
- Whether she would consider a local alternative.
- What website/app/CRM features would make switching worthwhile.

### Bawar / GAR president

Why:

- GAR context and broad broker landscape.
- Potential path to MLS/GAR introductions.

Ask him:

- Whether a Guam-built brokerage platform would be welcomed.
- What rules/concerns should be handled early.
- Who else to interview.

## Demo posture

Hafa Homes should be demoed as:

1. A polished consumer app experience.
2. A proof that Shimizu can ship a credible real estate product.
3. The reference implementation for broker-branded sites/apps.
4. The beginning of a lead CRM, not just a listing browser.

## Decision summary

- Keep Hafa Homes.
- Use Hafa Homes as the demo/reference product.
- Build one shared multi-tenant platform backend.
- Build broker-branded sites/apps from shared codebases/config, not separate full stacks.
- Broker-owned domains are the primary web product; slugs are preview/dev fallback only.
- CRM/lead routing foundation is now implemented enough for a credible demo.
- Build broker-branded websites/apps next because broker feedback points toward website/app/CRM replacement or augmentation.
- Treat Real Geeks as the main broker-software competitor.
- Differentiate through Guam-first UX, local support, fast customization, and rental/property-management workflows.
