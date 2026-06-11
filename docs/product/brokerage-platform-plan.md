# Hafa Homes Brokerage Platform Plan

_Last updated: 2026-06-10 after PR #11 account deletion/App Store resubmission and admin/notification QA findings._

## Positioning

Hafa Homes is now being built toward a broker-first Guam real estate software platform. Hafa Homes itself is the demo/reference product; the larger platform should support broker-owned-domain websites, broker-branded apps, lead CRM, and future property-management workflows.

Consumer-facing promise:

> A polished Guam-first app for finding homes, rentals, neighborhoods, agents, and next steps.

Broker-facing promise:

> A brokerage app, lead platform, and future property-management portal that helps Guam brokers convert buyers/renters, support agents, automate workflows, and modernize their rental/property-management operations.

## Business model

Primary customer: **brokerages**, not individual agents.

Competitive reference: **Real Geeks**. Broker feedback indicates many Guam brokers use/know Real Geeks, which means Hafa Homes must speak to the full website + app + CRM + lead quality bundle, not only mobile listing search.

Why:

- Brokers have more budget than individual agents.
- Brokers can authorize MLS/Flexmls/listing access.
- Brokers can distribute leads to agents.
- Brokers can use Hafa Homes as a recruiting/retention and lead-conversion tool.
- Brokerages may already have websites, so the differentiator is app-first experience + admin/lead/property workflows.

## Package tiers

### Tier 1 — Brokerage Website/App / Search

- Branded brokerage presence.
- Broker-owned-domain website/search surface.
- Optional broker-branded mobile app from shared Expo codebase.
- Listing search/filter/map.
- Listing detail pages.
- Agent/broker attribution.
- Basic inquiry/showing request capture.
- MLS/listing feed integration once broker authorizes it.

### Tier 2 — Engagement / Lead Platform

Everything in Tier 1, plus:

- Direct contact/messaging workflow.
- Showing/scheduling requests.
- Saved listings/favorites.
- Mortgage/finance calculator.
- Local Intel / neighborhood context.
- Broker/agent lead inbox.
- Lead routing and status tracking.
- Lead notes/tasks/activity timeline.
- Basic lead quality indicators.

### Tier 3 — Property Management / Tenant Portal

Everything in Tier 2, plus:

- Managed rental properties.
- Tenant accounts.
- Lease/file uploads.
- Lease expiration/reference data.
- Rent payment status and future online payments.
- Manager/tenant messaging.
- Maintenance requests later.

## Current build status

Completed platform foundations now include:

- auth and role model;
- brokerage/agent/membership tenancy;
- listing and lead brokerage/agent attribution;
- staff lead inbox/detail with tenant scoping;
- showing appointments and request history;
- safe notification delivery logging/foundation;
- CRM notes, tasks, activity timeline, source/campaign fields, and edit/archive controls.

The product can now credibly demo a broker lead workflow, not only a consumer listing browser.

Next gaps:

> First, harden account/admin/notification operations so broker demos feel credible: profile phone/preferred-contact prefill, admin user lifecycle, global audit history, notification link/copy polish, and consumer/admin form parity.

> Then, build the domain-first broker-branded public website/app layer so each brokerage can see how Hafa Homes could power its existing or future customer-facing domain/app experience.

## Product architecture implications

Continue building platform foundations:

- `Brokerage`
- `Agent`
- `Listing` belongs to brokerage and optionally agent
- `Lead` belongs to listing and routes to brokerage/agent
- user roles: consumer, agent, broker/admin, platform admin
- brokerage branding/config
- brokerage domain/app config
- feed/source metadata per brokerage
- subscription/package metadata eventually

## Near-term product priorities

1. Consumer profile/settings with phone/preferred-contact fields and signed-in lead-form prefill.
2. Consumer/admin form parity and notification link/copy polish.
3. Admin-created user/invite/archive lifecycle.
4. Global audit log/history.
5. Domain-first broker-branded website/app foundation.
6. Brokerage-scoped public search/listing pages.
7. Agent roster/profile pages.
8. Brokerage-routed lead forms.
9. Lead quality and CRM automation follow-up.
10. MLS/Flexmls/GAR discovery and adapter planning.
11. Property-management preview surface.
12. Production demo hardening and TestFlight refresh when ready.

See `docs/product/admin-ops-notification-hardening-plan.md`.

## August 1 target

Goal: be ready to demo/sell to brokers by **2026-08-01**.

By then, Hafa Homes should be able to show:

- polished mobile search/map/listing flow
- listing detail with agent/broker/local intel
- request showing/contact flow
- broker/agent identity
- lead capture/routing story
- web/admin broker dashboard and CRM workflow
- broker-owned-domain website/app concept
- property-management premium-tier concept
- clear pricing/packages/proposal

## Related meeting notes

- `docs/meetings/2026-06-01-ssi-automation-hafa-homes.md`
- `docs/meetings/2026-06-05-broker-feedback-realgeeks.md`
- `docs/product/white-label-brokerage-platform-plan.md`
- `docs/research/realgeeks-competitive-analysis.md`
- Brain-Dump transcript: `work/shimizu-tech/SSI-Automation/1) 1st Meeting with Mike and John for SSI Automation.md`
