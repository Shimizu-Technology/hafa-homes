# Hafa Homes August 1 Demo Plan

_Last updated: 2026-06-05 after broker feedback / Real Geeks research._

## Goal

By **August 1, 2026**, Hafa Homes should be credible enough for Leon, Mike, and John to demo/sell to Guam brokers as:

> A Guam-first brokerage website + brokerage app + lead CRM + future property-management portal.

Hafa Homes is the demo/reference product. The sales story should make clear that the same platform can power a broker's own branded website and app if that is what the broker wants.

This does **not** require full MLS sync, payment processing, chat, or full tenant workflows by August 1. The goal is a polished, believable product and sales story that can support broker discovery and pilot conversations.

## Current milestone

- iOS app submitted to App Review for public App Store release.
- TestFlight is already working.
- Current app supports search, map, listing detail, saved homes, showing requests, mortgage calculator, and Local Intel.
- Product strategy has shifted broker-first after the SSI Automation meeting with Mike Sakazaki and John Ilao.
- 2026-06-05 broker feedback added Real Geeks as the key competitive reference and pushed the plan toward broker-branded websites/apps plus CRM.

## Strategic priorities

### 1. Auth and roles foundation

Start here if scoped as platform infrastructure, not just consumer login.

Roles needed:

- platform admin
- brokerage admin
- agent
- consumer

Minimum viable auth scope:

- User model.
- Secure password or magic-link sign-in.
- API token/session handling for mobile and web.
- Role field or role assignments.
- Current-user endpoint.
- Web admin route protection.
- Mobile token storage with Expo SecureStore.

Why this can come first:

- Broker/admin lead inbox requires restricted access.
- Brokerage admins should only see their own data.
- Agents need future lead/listing access.
- Consumer saved listings eventually need accounts.

Important constraint:

> Do not overbuild consumer auth first. Build auth/roles as the foundation for brokerage/admin workflows.

### 2. Brokerage and agent platform model

Add:

- Brokerage model.
- Agent model.
- Listings belong to brokerage and optionally agent.
- Leads route to brokerage and optionally agent.
- Seed demo brokerages/agents.
- API returns brokerage/agent data.
- Mobile listing detail shows broker/agent context better.

### 3. Broker-branded website/app story

Show that Hafa Homes is not only one consumer app. It is the demo/reference implementation for broker-specific websites and broker-branded app builds.

Add:

- Brokerage branding/config concept.
- Broker domain/app deployment story.
- Website takeover pitch: homepage, search, listings, agent pages, lead forms.
- Shared backend/codebase explanation so Mike/John can explain why this is scalable.

### 4. Broker/admin lead inbox

Add:

- Web/admin lead inbox.
- Lead statuses: new, contacted, showing scheduled, closed, archived/spam.
- Lead detail view.
- Listing, brokerage, agent, contact method, and message shown clearly.
- Basic assignment/routing.

### 5. Server-backed saved listings

Add after auth foundation:

- Saved listings table.
- API endpoints.
- Mobile save sync when logged in.
- Keep anonymous local saves as fallback.

### 6. Property-management preview

For August, build a premium-tier demo surface only:

- Managed properties list.
- Tenant list.
- Lease/date placeholders.
- Rent payment status placeholder.
- Document placeholder.
- Future online payments note.

Do not build full payments or maintenance workflows yet.

### 7. Broker pitch and package docs

Mike and John need:

- One-page broker pitch.
- Package tiers.
- Pricing hypotheses.
- Setup fee/monthly subscription options.
- MLS/Flexmls FAQ.
- Broker demo script.
- Real Geeks competitive positioning.
- White-label brokerage website/app plan.

### 8. MLS/Flexmls discovery

By August 1, the team should know or have a credible answer for:

- Can a Guam broker authorize Hafa Homes as a third-party app/vendor?
- Which feed path is available: IDX, RESO Web API, RETS, Flexmls IDX, iframe/embed, CSV/export, or other?
- What attribution/disclaimers are required?
- Are photos allowed?
- What refresh cadence is required?
- Can leads route to listing agent, selected agent, or broker?

### 9. Android setup

Secondary to broker platform work, but useful by August:

- Google Play Developer account.
- Android package/app signing.
- Internal testing track.
- Public listing once iOS flow is stable.

## Suggested timeline

### June 1–7

- Monitor App Review.
- Share App Store link when approved.
- Start auth/roles foundation branch.
- Decide auth approach.
- Add User model and basic sessions/token flow.

### June 8–21

- Add brokerage/agent models.
- Add listing attribution.
- Add lead routing fields.
- Seed demo brokerages/agents.
- Protect web admin routes.

### June 22–July 5

- Build broker/admin lead inbox.
- Add lead statuses.
- Add current-user/role-aware UI.
- Add server-backed saved listings if auth is stable.

### July 6–19

- Build property-management preview.
- Polish mobile broker/agent listing detail surfaces.
- Draft broker pitch, package tiers, and pricing docs.
- Continue MLS/Flexmls discovery.

### July 20–August 1

- Polish and bug fix.
- Submit App Store update if needed.
- Prepare Android internal test if time allows.
- Rehearse broker demo.
- Finalize first broker discovery targets.

## Recommended next branch

```bash
feature/auth-roles-foundation
```

## Definition of done for August 1

- Public iOS App Store listing is live or approved.
- Mobile app demo feels polished.
- Auth/roles exist.
- Broker/admin can access protected web dashboard.
- Brokerages/agents are modeled in data.
- Listings and leads show brokerage/agent attribution.
- Broker lead inbox exists.
- Broker-branded website/app strategy is documented and demoable.
- Property-management premium tier can be demonstrated as a preview.
- Pitch/pricing/package docs are ready for Mike and John.
- Real Geeks competitive positioning is documented.
- MLS/Flexmls access path is at least understood enough for broker conversations.
