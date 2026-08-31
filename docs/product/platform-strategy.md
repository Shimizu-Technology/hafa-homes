# Hafa Homes Platform Strategy

_Last updated: 2026-06-10 after PR #11 account deletion, iOS build `1.0.1 (9)` submission, and admin/notification QA findings._

## Current direction

Hafa Homes is evolving from a proof-of-concept search demo into a broker-first Guam real estate software platform.

The working strategy is:

> Hafa Homes is the demo/reference Guam real estate app and the platform brand behind brokerage-specific websites, brokerage-specific apps, lead CRM, and future property-management workflows.

Brokerages can subscribe to Hafa Homes-powered software, authorize or connect their MLS/listing feed, publish their listings/agents, receive/reroute leads, and eventually manage rental/tenant workflows.

The 2026-06-05 broker feedback shifted the architecture from “one Hafa Homes app that every broker subscribes into” toward a **white-label-capable brokerage platform**. Hafa Homes remains the demo and possible public marketplace layer, but individual brokerages may want their own branded site/app powered by the same backend and codebases.

This is closer to a Guam-first Real Geeks alternative — brokerage website + brokerage app + lead CRM + property-management portal — than a one-off website for a single brokerage.

## Current implementation status

As of PR #10, the platform foundation now includes:

- Clerk auth and Rails-owned product roles.
- broker/agent tenancy with `Brokerage`, `Agent`, and `BrokerageMembership`.
- listing/lead brokerage and agent attribution.
- tenant-scoped staff lead access.
- consumer saved homes and request history.
- public showing request capture.
- staff showing scheduling.
- safe notification logging/foundation through Resend and ClickSend gates.
- broker/admin CRM primitives: notes, tasks, activity timeline, source/campaign tracking, edit/archive controls, and paginated history endpoints.

Current product maturity:

```text
credible broker-platform demo
```

Still missing before a full Real Geeks-style sales claim:

- proper consumer profile/settings with phone/preferred-contact prefill;
- admin-created user/invite/archive lifecycle;
- global admin audit logs/history;
- notification/deep-link polish;
- domain-first broker-branded public website/app layer;
- real MLS/Flexmls authorization and sync;
- lead verification/scoring/automation;
- property-management preview;
- production deployment/demo hardening.

## Why this is valuable

Existing broker websites may already have MLS/IDX search, but they often feel like standard website integrations rather than a polished app experience.

Hafa Homes should compete on:

- app-first mobile UX
- map-first search
- Guam-specific filters and content
- agent/broker lead generation
- saved listings and saved searches
- direct showing/contact flows
- neighborhood guidance
- mortgage/affordability guidance
- analytics and admin workflows for agents/brokerages
- broker-branded websites and apps from a shared platform
- CRM/lead follow-up workflows

The pitch is not just “we can show MLS listings.” The pitch is:

> We make the MLS/listing experience easier, more mobile, more local, and better at converting buyers/renters into agent conversations.

## Business model hypothesis

### Primary model: brokerage subscription

Brokerages pay Hafa Homes for software, app presence, lead conversion, and operational tooling. Individual agents may benefit through their brokerage, but the first sales motion should target brokers rather than agent-by-agent subscriptions.

Brokerages/agents pay Hafa Homes for software and distribution, not for the MLS data itself.

Possible paid components:

- brokerage subscription
- setup/onboarding fee
- package tiers: search/app, lead engagement, property management
- per-agent seats or included agent allowances
- MLS/feed integration fee
- featured agent/listing placement
- lead inbox/CRM tools
- analytics/reporting
- native app packaging/support
- property-management / tenant portal features
- white-label brokerage website/app configuration

### What subscribers get

- agent/brokerage profile pages
- listing presence on Hafa Homes
- direct contact and showing requests
- lead inbox and lead history
- saved-search buyer/renter intent
- brokerage/agent branding
- analytics on listing views, saves, inquiries, and lead sources
- broker-branded website/app support
- optional website/app embed or landing page support

## MLS/Flexmls understanding

Mike confirmed that Guam brokers use `my.flexmls.com` / Flexmls as the MLS platform.

Working assumptions to validate:

- Guam brokerages/agents already pay membership or MLS-related access fees.
- A participating brokerage/agent may be able to authorize Hafa Homes to connect to their listing/MLS feed.
- The exact feed type is still unknown: IDX, Flexmls IDX product, RESO Web API, RETS, iframe/embed, CSV/export, or another vendor-approved method.
- MLS/Flexmls rules will determine what Hafa Homes can display, how often data must refresh, what attribution/disclaimers are required, whether photos are allowed, and how leads can be routed.

## Key compliance/data questions

Before using real MLS data, confirm with Mike/broker/Flexmls/MLS:

1. Can Hafa Homes be approved as a third-party/vendor app for participating Guam brokerages?
2. Can multiple brokerages authorize feeds into one Hafa Homes consumer platform?
3. Does the feed include all IDX-approved MLS listings or only the subscribing brokerage/agent listings?
4. Can non-subscribed brokerage listings appear on Hafa Homes?
5. Are listing photos included and displayable?
6. What listing broker/agent attribution is required?
7. What MLS disclaimers must appear?
8. How often must listings refresh?
9. Are statuses like pending, under contract, escrow, sold, rented, or withdrawn available/displayable?
10. Can leads go directly to the listing agent, selected agent, or sponsoring brokerage?
11. Are registration walls required for certain details?
12. Can Hafa Homes store/cache listing data and images?

## Architecture implication

Build marketplace-style data ownership from the beginning:

- Brokerage model
- Agent/Realtor model
- Listing belongs to brokerage and optionally listing agent
- Lead can belong to listing, agent, brokerage, and lead source
- Subscription status for brokerage/agent access
- Feed/source metadata on listings
- Sync runs per feed/source
- Attribution/disclaimer fields

This keeps Hafa Homes flexible enough for:

- marketplace model
- participating-broker-only model
- brokerage-sponsored model
- white-label brokerage deployment if needed

## Native app positioning

Historical note: this section predates the dedicated Expo/React Native app and is retained as product rationale. The current product has both a web/PWA surface and a native codebase, with iOS released publicly.

Positioning:

- PWA/web app now for speed and validation
- iOS/Android packaging later once product and MLS access are validated
- implemented path: dedicated Expo/React Native app backed by the shared Rails API

Native app selling points:

- “Your agents/listings are in a real mobile app”
- push notifications for saved searches and lead responses
- app-store presence
- stronger perceived value than “another website”

## Recommended next product direction

Build toward a broker-first platform while keeping the existing consumer demo polished.

Next major product capabilities:

1. Consumer profile/settings with phone/preferred-contact fields and signed-in form prefill.
2. Notification/form parity polish: `Flexible` preferred time, no duplicate email greetings, app-first notification links with web fallback.
3. Admin user lifecycle: create/invite, edit, archive/reactivate/revoke users across admins, agents, and consumers.
4. Global audit log/history for user, lead, showing, notification, and account actions.
5. Domain-first broker-branded website/app configuration and public pages.
6. `BrokerageDomain` host-based tenant resolution with slug preview fallback.
7. Brokerage-scoped listing/search surfaces.
8. Agent roster/profile pages.
9. Lead forms routed from broker-branded surfaces to the correct brokerage.
10. Lead quality follow-up: duplicate detection, verification badges, saved-search/listing activity scoring, speed-to-lead reminders.
11. MLS/Flexmls sync adapter skeleton once a broker authorizes access.
12. Property-management / tenant portal preview for premium package.
13. Production deployment/demo hardening.
14. Native broker-branded app build profiles and App Store strategy.
15. Map/search polish and SEO-oriented public content pages.

## Meeting source

Source notes/transcript:

- `Brain-Dump/work/shimizu-tech/Michael Sazaki (BOH)/2) Talk with Mike about HafaHomes and Shimizu Technology - May 24, 2026.md`
- `Brain-Dump/work/shimizu-tech/SSI-Automation/1) 1st Meeting with Mike and John for SSI Automation.md`
- `docs/meetings/2026-06-01-ssi-automation-hafa-homes.md`
- `docs/product/brokerage-platform-plan.md`
- `docs/product/white-label-brokerage-platform-plan.md`
- `docs/research/realgeeks-competitive-analysis.md`
- `docs/meetings/2026-06-05-broker-feedback-realgeeks.md`
