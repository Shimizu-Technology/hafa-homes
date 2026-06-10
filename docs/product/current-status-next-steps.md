# Hafa Homes Current Status and Next Steps

_Last updated: 2026-06-10 after requests/scheduling/admin parity merge and broker CRM expansion branch._

## Source context

Product direction comes from the Hafa Homes docs plus Leon/Mike discussion notes:

- `docs/product/product-brief.md`
- `docs/product/platform-strategy.md`
- `docs/product/native-mobile-plan.md`
- Brain-Dump source: `work/shimizu-tech/Michael Sazaki (BOH)/2) Talk with Mike about HafaHomes and Shimizu Technology - May 24, 2026.md`

Mike's key signal: Guam brokerages already have websites/MLS integrations, so Hafa Homes should win by being the polished Guam-first app layer: better mobile UX, better lead capture, clearer agent/brokerage value, and a real App Store/TestFlight presence.

The 2026-06-01 meeting with Mike and John sharpened the strategy: Hafa Homes should be sold broker-first as a brokerage app + lead platform + future property-management portal, with Mike/John helping on sales, relationships, pricing, packaging, and operator/project-management work.

The 2026-06-05 broker feedback added Real Geeks as the key competitor and clarified that brokers may want Hafa Homes/Shimizu to take over their actual brokerage website too. The new direction is to keep Hafa Homes as the demo/reference product while building a white-label-capable brokerage website + app + CRM platform.

## Where we are now

### Shipped / working

- Rails API deployed at `https://hafa-homes.onrender.com`.
- Web/PWA demo deployed at `https://hafahomes.netlify.app`.
- Privacy policy route exists at `https://hafahomes.netlify.app/privacy`.
- Expo native app exists under `/mobile`.
- EAS project is configured: `@shimizutechnology/hafa-homes`.
- iOS bundle ID is registered: `com.shimizutechnology.hafahomes`.
- First production iOS build was created and appears in TestFlight.
- TestFlight install works on a real phone.
- Mobile app includes:
  - Buy/Rent toggle
  - listing fetch from production Rails API
  - map tab with Mapbox WebView
  - listing detail screen
  - server-backed saved listings after sign-in, with migration from old local AsyncStorage saves
  - mortgage calculator gated to for-sale listings
  - agents/more placeholder surfaces
  - in-app showing request form wired to Rails leads
  - zoom-aware map clusters/counts and marker preview cards
  - Phase 1 Local Intel on listing detail pages

### Known limitations

- Listings are still seed/demo data, not authorized MLS/Flexmls data.
- Brokerage/agent tenancy foundation is merged through PR #8.
- Broker lead inbox/detail, lead status, assigned-agent updates, and staff-editable lead/customer request fields are implemented on web admin.
- PR #9 added consumer request history, showing appointments, responsive admin dashboard/users/showings with compact mobile controls, stricter role scoping, web/mobile listing-detail parity, a collapsible admin sidebar, role-filtered user management, and a safe Resend/ClickSend notification foundation with compose/resend actions, paginated recent-send history, scheduled-showing notifications, Guam phone normalization, guarded consumer-only initial request notifications, and atomic delivery-job claiming to avoid duplicate live sends.
- `feature/broker-crm-expansion` adds CRM notes, tasks, edit/archive CRM controls, server-counted CRM summary metrics, paginated staff history endpoints, expandable activity change details, source/campaign tracking fields, and a mobile/desktop responsive CRM workspace on lead detail.
- Property-management/tenant portal features are not built yet.
- Latest main should be deployed and submitted to TestFlight after the Local Intel merge.
- App Store public release metadata/screenshots/privacy answers still need to be completed in App Store Connect.

## Recommended next product priorities

### 1. Brokerage tenancy / white-label platform foundation

Add brokerages, agents, attribution, lead routing, and tenant/branding foundations before going deeper on consumer-only features.

Recommended scope:

- Brokerage model.
- Agent model.
- Brokerage membership model.
- Brokerage branding/domain/app config.
- Listings belong to brokerage and optionally listing agent.
- Leads route to listing, brokerage, and optionally agent.
- Brokerage/agent data exposed in API payloads.
- Seed demo brokerages/agents for broker-facing demos.
- Mobile listing detail shows brokerage/agent more intentionally.
- Web/admin begins showing brokerage lead context.

Why it matters:

- The business model is now broker-first.
- Brokers need to see how Hafa Homes helps their office and agents, not only consumers.
- MLS access will likely be broker-authorized.
- Pricing/package discussions require a credible broker-facing platform story.

### 2. CRM / lead inbox foundation

Build a focused real estate CRM before attempting to copy every Real Geeks feature.

Implemented/in progress:

- Broker/agent lead inbox.
- Lead statuses: new, contacted, showing scheduled, nurturing, closed, lost, spam/archived.
- Lead assignment/routing.
- Lead detail page.
- Notes.
- Tasks/reminders.
- Basic activity timeline.
- Source/campaign tracking fields.

Recommended next CRM scope:

- Duplicate lead detection.
- Verified email/phone badges.
- Saved-search/listing activity scoring.
- CSV export.
- Notification settings later.
- Delivery webhook/receipt sync for Resend and ClickSend after the initial gated notification foundation.

Why it matters:

- Broker value depends on lead conversion, not only search UI.
- Real Geeks competes heavily on CRM, lead quality, and follow-up workflows.
- Agents/brokers need accountability around who followed up and when.

### 3. Broker website takeover / branded site foundation

Plan for broker-specific websites powered by the same platform.

Recommended scope:

- Brokerage homepage config.
- Search/listings page scoped to brokerage.
- Agent roster/profile pages.
- Buyer/seller/renter/property-management pages.
- Lead forms routed to brokerage.
- Compliance/disclaimer blocks.
- Tenant-aware domain/slug routing.

### 4. Map search polish

The current map now has loading states, broad-zoom clusters/counts, price markers, and marker preview cards. Continue polishing it toward the Locations LLC/Hawaii principle: broad overview first, details only when the user zooms in.

Recommended scope:

- Better initial loading state while listings and Mapbox are loading.
- A map skeleton/brand loading panel instead of blank or jarring marker pop-in.
- Zoom-aware marker display:
  - low zoom / whole island: show clusters, village counts, or no price pills
  - medium zoom: show grouped counts by region/village
  - high zoom: show individual listing price pills
- Marker collision/overlap handling.
- Bottom-sheet listing preview when tapping a marker.
- Keep the full-map mode, but make it feel like the primary search surface.

Locations-style principle:

> At broad map zoom, avoid showing every listing price because it becomes visual noise. Reveal specific price markers only when the user is zoomed into a meaningful neighborhood/village area.

### 5. MLS/Flexmls discovery and data model

Before real public launch, confirm authorized data access and compliance.

Needed decisions:

- Which brokerage/agent is first pilot?
- Is Hafa Homes approved as a vendor/app?
- Feed type: IDX, RESO Web API, RETS, Flexmls IDX, CSV, or other.
- Required listing attribution/disclaimers.
- Photo rights and caching rules.
- Lead routing rules.

### 6. Property management / tenant portal premium tier

Mike explicitly raised property management before the meeting, and the group agreed it is important because Guam real estate is rental-heavy.

Recommended MVP/demo scope:

- Managed properties list.
- Tenant list.
- Lease document/date placeholders.
- Rent payment status placeholder.
- Future online payment workflow notes.
- Keep advanced management on web/admin; mobile can support lightweight tenant tasks later.

### 7. Agent/brokerage marketplace foundation

Add backend models and web admin surfaces for:

- brokerages
- agents
- listings belonging to brokerages/agents
- lead routing
- subscriptions/seats later
- listing/source attribution

## Suggested immediate sprint

PR #8 is merged. The active sprint is **Requests, Showings, Admin, and Public Parity**.

Recommended branch:

```bash
feature/requests-scheduling-admin-parity
```

Scope:

1. Add consumer request history on web/mobile.
2. Add first-class showing appointments and admin scheduling.
3. Replace thin admin pages with a proper admin shell/dashboard.
4. Add platform-admin user/role/brokerage membership management.
5. Tighten agent scoping so agents default to assigned leads only.
6. Bring web/mobile listing detail functionality into closer parity.

See `docs/product/requests-scheduling-admin-parity-plan.md` for implementation notes.

## App Store/TestFlight status

- TestFlight is working for Leon.
- For Mike and others, add them as TestFlight testers in App Store Connect or send the public TestFlight invite link if enabled.
- Public App Store release still requires App Store metadata, screenshots, privacy answers, and final review submission.
