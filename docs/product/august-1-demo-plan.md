# Hafa Homes August 1 Demo Plan

_Last updated: 2026-06-10 after PR #10 broker CRM expansion merged._

## Goal

By **August 1, 2026**, Hafa Homes should be credible enough for Leon, Mike, and John to demo/sell to Guam brokers as:

> A Guam-first brokerage website + brokerage app + lead CRM + future property-management portal.

Hafa Homes is the demo/reference product. The sales story should make clear that the same platform can power a broker's own branded website and app if that is what the broker wants.

This does **not** require full MLS sync, payment processing, chat, or full tenant workflows by August 1. The goal is a polished, believable product and sales story that can support broker discovery and pilot conversations.

## Current milestone

Already built/merged:

- Expo mobile app foundation and historical TestFlight build.
- Web/PWA public listing/search surfaces.
- Clerk auth and roles.
- Server-backed saved homes.
- Broker/agent tenancy and staff scoping.
- Broker/admin lead inbox/detail.
- Consumer request history.
- Showing appointments and admin scheduling.
- Safe notification delivery foundation.
- CRM workspace with notes, tasks, activity timeline, edit/archive controls, source/campaign tracking, and responsive admin UI.

Current maturity:

```text
credible broker-platform demo
```

Still needed for a stronger August broker pitch:

- latest API/mobile deployment and Apple/TestFlight refresh;
- domain-first broker-branded website/app foundation;
- property-management preview;
- production deploy/demo hardening;
- package/pricing/proposal materials;
- MLS/Flexmls/GAR discovery answers.

## Strategic priorities from here

### 1. Domain-first broker-branded website/app story

This is the next product priority.

Show that Hafa Homes is not only one consumer app. It is the demo/reference implementation for broker-owned domains, broker-specific websites, and broker-branded app builds.

Add:

- `BrokerageDomain` and host-based tenant resolution.
- Brokerage branding/config.
- Brokerage public homepage/profile on owned domains.
- Brokerage-scoped search/listings.
- Agent roster/profile pages.
- Broker domain/app deployment story.
- Website takeover pitch: homepage, search, listings, agent pages, lead forms.
- Shared backend/codebase explanation so Mike/John can explain why this is scalable.

See `docs/product/broker-branded-layer-plan.md`.

### 2. Production demo hardening

Before serious broker demos, verify latest merged features in production:

- deploy latest API;
- run production migrations;
- verify background jobs;
- deploy latest web;
- verify notification gates/config;
- refresh TestFlight/mobile config if needed;
- set up demo users/data.

### 3. Property-management preview

For August, build a premium-tier demo surface only:

- Managed properties list.
- Tenant list.
- Lease/date placeholders.
- Rent payment status placeholder.
- Document placeholder.
- Future online payments note.

Do not build full payments or maintenance workflows yet.

### 4. Broker pitch and package docs

Mike and John need:

- One-page broker pitch.
- Package tiers.
- Pricing hypotheses.
- Setup fee/monthly subscription options.
- MLS/Flexmls FAQ.
- Broker demo script.
- Real Geeks competitive positioning.
- White-label brokerage website/app explanation.

### 5. MLS/Flexmls discovery

By August 1, the team should know or have a credible answer for:

- Can a Guam broker authorize Hafa Homes as a third-party app/vendor?
- Which feed path is available: IDX, RESO Web API, RETS, Flexmls IDX, iframe/embed, CSV/export, or other?
- What attribution/disclaimers are required?
- Are photos allowed?
- What refresh cadence is required?
- Can leads route to listing agent, selected agent, or broker?

### 6. Lead quality / CRM automation follow-up

After broker branding, improve the Real Geeks comparison:

- duplicate lead detection;
- verified email/phone badges;
- saved-search/listing activity scoring;
- speed-to-lead reminders;
- CSV export;
- agent follow-up reporting.

## Suggested updated timeline

### June 10–June 21

- Deploy latest API/migrations for mobile dependencies.
- Build and submit latest iOS/TestFlight build.
- Then build domain-first broker-branded website/app foundation.
- Update demo data/branding.
- Continue broker/MLS discovery.
- Draft package/pricing outline.

### June 22–July 5

- Add lead quality quick wins if time allows.
- Build property-management preview surface.
- Prepare broker demo script.
- Continue Carl/Clare/Bawar conversations.

### July 6–July 19

- Production deploy/hardening.
- Refresh TestFlight/mobile demo if needed.
- Finalize package/pricing docs.
- Prepare first broker pilot proposal.

### July 20–August 1

- Polish and bug fix.
- Rehearse broker demo.
- Decide first 3–5 broker discovery/pilot targets.
- Demo with Mike/John and then trusted broker contacts.

## Recommended next branch

```bash
feature/broker-branded-sites-apps
```

## Definition of done for August 1

- Public demo feels polished on web/mobile.
- Domain-first broker-branded website/app story is demoable.
- Broker/admin CRM workflow is demoable end-to-end.
- Showing request/scheduling flow is demoable end-to-end.
- Property-management premium tier can be demonstrated as a preview.
- Pitch/pricing/package docs are ready for Mike and John.
- Real Geeks competitive positioning is documented.
- MLS/Flexmls access path is at least understood enough for broker conversations.
- Production deployment and demo data are stable enough for live broker meetings.
