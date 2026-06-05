# Hafa Homes Brokerage Platform Plan

_Last updated: 2026-06-05 after broker feedback / Real Geeks research._

## Positioning

Hafa Homes is now being built toward a broker-first Guam real estate software platform. Hafa Homes itself is the demo/reference product; the larger platform should support broker-branded websites, broker-branded apps, lead CRM, and future property-management workflows.

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
- Broker-branded website/search surface.
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

## Product architecture implications

Build platform foundations now:

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

1. Brokerage and agent data model.
2. Listing association with brokerage/agent.
3. Lead routing / broker lead inbox.
4. Auth and roles.
5. Server-backed saved listings.
6. Broker demo dashboard.
7. Property-management preview surface.
8. Current TestFlight/App Store polish.

## August 1 target

Goal: be ready to demo/sell to brokers by **2026-08-01**.

By then, Hafa Homes should be able to show:

- polished mobile search/map/listing flow
- listing detail with agent/broker/local intel
- request showing/contact flow
- broker/agent identity
- lead capture/routing story
- web/admin broker dashboard concept
- property-management premium-tier concept
- clear pricing/packages/proposal

## Related meeting notes

- `docs/meetings/2026-06-01-ssi-automation-hafa-homes.md`
- `docs/meetings/2026-06-05-broker-feedback-realgeeks.md`
- `docs/product/white-label-brokerage-platform-plan.md`
- `docs/research/realgeeks-competitive-analysis.md`
- Brain-Dump transcript: `work/shimizu-tech/SSI-Automation/1) 1st Meeting with Mike and John for SSI Automation.md`
