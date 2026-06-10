# Hafa Homes Broker Platform Implementation Plan

_Last updated: 2026-06-10 after PR #9 merge and broker CRM expansion branch._

## Purpose

This document turns the broker-first / Real Geeks strategy into an implementation sequence.

Hafa Homes should continue to be the polished demo/reference app, but the larger product should become a shared platform that can power:

- Hafa Homes public discovery app.
- broker-branded websites.
- broker-branded mobile apps from the shared Expo codebase.
- broker/admin/agent lead CRM workflows.
- future rental/property-management tools.

## Current foundation already completed

PR #7 completed Phase 0:

- Clerk auth across Rails API, React web, and Expo mobile.
- Rails `User` model.
- product roles: `platform_admin`, `brokerage_admin`, `agent`, `consumer`.
- protected admin/staff API access.
- server-backed saved listings.
- migration from legacy local mobile saves.
- signed-in lead submissions attach `user_id`.
- public/signed-out showing requests remain low-friction.
- Google and Apple sign-in in the mobile app.

This means the next work should not be more generic consumer auth. The next work should make Hafa Homes a broker platform.

## Recommended PR structure

Do **not** combine the full tenancy, CRM, broker website, white-label app, lead quality, and property-management roadmap into one giant PR.

Instead:

1. PR 1 — Broker Platform Foundation.
2. PR 2 — Requests, Showing Scheduling, Admin Console, and Public Parity.
3. PR 3 — CRM Expansion and Lead Quality.
4. PR 4 — Broker Branding / Website Foundation.
5. PR 5 — Property Management Preview.

This keeps each PR reviewable while still moving fast.

## PR 1 — Broker Platform Foundation

Recommended branch:

```bash
feature/broker-platform-foundation
```

Goal:

> Add brokerage/agent tenancy plus a basic broker lead inbox so Hafa Homes starts behaving like a broker platform, not just a consumer listing app.

### Include in PR 1

#### Backend data model

Add:

- `Brokerage`
- `Agent`
- `BrokerageMembership`
- `Listing.brokerage_id`
- `Listing.agent_id`
- `Lead.brokerage_id`
- `Lead.assigned_agent_id`
- lead status foundation
- lead source / quality fields if useful for future CRM

#### Backend behavior

Add:

- listings expose brokerage/agent attribution in API payloads.
- leads infer brokerage/agent from the listing when possible.
- admin lead list is scoped by role/tenant:
  - platform admin sees all.
  - brokerage admin sees brokerage leads.
  - agent sees assigned / brokerage-scoped leads.
- staff users can view lead detail.
- staff users can update basic lead fields like status and assigned agent within their authorized scope.
- seed data includes a Hafa Homes demo brokerage and sample agents.

#### Web/admin UI

Add:

- stronger broker/admin lead inbox.
- lead detail view.
- brokerage/agent attribution on leads.
- lead status update.
- assigned-agent display/update if available.
- basic summary metrics.

#### Documentation

Update:

- implementation plan.
- current status / next steps.
- white-label platform plan if scope changes.

### Explicitly out of scope for PR 1

Do not include yet:

- broker-specific public website routing.
- custom brokerage domain routing.
- broker-branded Expo/EAS app builds.
- full notes/tasks/activity timeline.
- automated SMS/email drips.
- verified lead phone/email flow.
- seller valuation tool.
- full property-management module.
- payments.
- real MLS/Flexmls sync.

## PR 2 — Requests, Showing Scheduling, Admin Console, and Public Parity

Recommended branch:

```bash
feature/requests-scheduling-admin-parity
```

Goal:

> Close the product loop after lead capture: consumers can see their own requests, admins can schedule showings, platform admins can manage users/roles, agents are strictly scoped, and public web/mobile listing details have consistent functionality.

Scope:

- `ShowingAppointment` model and staff API.
- Consumer `GET /api/v1/me/leads` request history.
- Web `/account/requests`.
- Mobile `More → My requests`.
- Web admin dashboard/sidebar shell.
- Web admin showings page.
- Web admin users/roles page.
- Stricter role scoping: agents default to assigned leads only.
- Web/mobile listing detail parity: Local Intel, photo carousel, mortgage estimate, price alerts, saved homes, listing ID, and consistent request-a-showing copy.

## PR 3 — CRM Expansion and Lead Quality

Recommended branch:

```bash
feature/broker-crm-expansion
```

Goal:

> Start matching the broker value of Real Geeks: follow-up, quality, accountability, and lead conversion.

Scope:

- lead notes.
- tasks/reminders.
- activity timeline.
- source/campaign tracking fields.
- follow-up due/overdue indicators.
- basic quality flags using `quality_status`.
- responsive CRM workspace on lead detail.

See `docs/product/broker-crm-expansion-plan.md`.

## PR 4 — Broker Branding / Website Foundation

Recommended branch:

```bash
feature/broker-branding-website-foundation
```

Goal:

> Show that the same Hafa Homes platform can power each broker's own branded website/app experience.

Scope:

- brokerage branding config.
- brokerage logo/color/app display name fields.
- brokerage public profile/landing page.
- brokerage-scoped listing/search page.
- agent roster/profile pages.
- lead forms routed to brokerage.
- compliance/disclaimer blocks.
- “Powered by Hafa Homes” footer option.
- app branding configuration plan for future EAS builds.

## PR 5 — Property Management Preview

Recommended branch:

```bash
feature/property-management-preview
```

Goal:

> Add a demoable premium-tier surface for Guam's rental/property-management reality without building a full management suite yet.

Scope:

- managed properties list.
- tenant list.
- lease/date placeholders.
- rent status placeholder.
- maintenance request preview.
- owner/tenant portal concept.

## Parallel discovery track

Mike/John/Leon should keep gathering broker and MLS context while the product work continues.

### Carl / MLS committee

Ask:

- How Real Geeks connects to Flexmls/MLS in Guam.
- What vendor/app approval Hafa Homes needs.
- What attribution/disclaimer/photo rules apply.
- Whether one broker can authorize us or multiple brokers must each authorize us.

### Clare Delgado / Home Ventures

Ask:

- What Real Geeks does well or poorly.
- Whether agents actually use the CRM.
- How leads are routed/followed up today.
- Whether website takeover would be attractive.
- What property-management/rental workflows matter most.

### Bawar / GAR president

Ask:

- How GAR views a local Guam-built platform.
- What rules or political concerns should be handled early.
- Which brokers should be interviewed next.

## Build principles

- Public browsing stays unauthenticated.
- Saved homes require login and are server-backed.
- Showing requests remain public for low-friction lead capture.
- Signed-in showing requests attach `user_id` server-side.
- Broker/admin/agent access is role- and tenant-scoped.
- Do not create a separate full codebase per broker.
- Use one shared backend and shared frontend/mobile codebases with tenant config.
- Web admin is the primary serious admin/CRM surface.
- Mobile admin should stay lightweight until CRM workflows are proven.

## PR 1 implementation details

Planned API endpoints:

- `GET /api/v1/leads` — staff lead inbox, scoped by platform/brokerage/agent access.
- `GET /api/v1/leads/:id` — staff lead detail, scoped by platform/brokerage/agent access.
- `PATCH /api/v1/leads/:id` — update lead status and assigned agent within the user's authorized scope.
- `POST /api/v1/leads` — remains public/optional-auth for low-friction lead capture.

Planned lead statuses:

- `new`
- `contacted`
- `showing_scheduled`
- `nurturing`
- `closed`
- `lost`
- `spam`
- `archived`

Tenant scoping rule:

- platform admins can access all leads.
- brokerage admins can access leads for brokerages where they have an active membership.
- agents can access leads assigned to their agent profile and leads in their active brokerage scope.
- public lead creation cannot set `user_id`, `brokerage_id`, or `assigned_agent_id`; those are assigned server-side from auth/listing context.

## Success criteria for PR 1

PR 1 is successful when:

- the database has brokerages, agents, and memberships.
- listings and leads can be attributed to brokerages/agents.
- seeded demo data shows brokerage/agent context.
- the API enforces tenant scoping for staff lead access.
- the web lead inbox shows lead status, brokerage, assigned agent, and listing interest.
- staff can open a lead detail page and update status / assigned agent.
- existing public browse/save/showing flows still work.
