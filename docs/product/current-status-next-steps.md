# Hafa Homes Current Status and Next Steps

_Last updated: 2026-06-28 after PR #19 buyer/search profile prompt personalization merged to `main`._

> Archived status snapshot. It is retained for implementation history and does not describe current `main`. Use `current-product-truth.md` and `connected-record-architecture.md` for the current product and architecture.

## Source context

Product direction comes from repo docs plus Leon/Mike/John notes:

- `docs/product/product-brief.md`
- `docs/product/platform-strategy.md`
- `docs/product/mike-john-next-build-plan.md`
- `docs/product/broker-branded-layer-plan.md`
- `docs/product/buyer-search-profile-prompt-plan.md`
- `docs/meetings/2026-06-01-ssi-automation-hafa-homes.md`
- `docs/meetings/2026-06-05-broker-feedback-realgeeks.md`
- `docs/research/realgeeks-competitive-analysis.md`
- Brain-Dump: `work/shimizu-tech/SSI-Automation/1) 1st Meeting with Mike and John for SSI Automation.md`
- Brain-Dump: `work/shimizu-tech/SSI-Automation/2) Meeting with Mike and John for HafaHomes.md`
- Brain-Dump: `work/shimizu-tech/Michael Sazaki (BOH)/2) Talk with Mike about HafaHomes and Shimizu Technology - May 24, 2026.md`
- Brain-Dump: `work/shimizu-tech/JMI-John-Ilao/2) Meeting with John about the Dispatch App.md`

Key strategic signal:

> Hafa Homes should be sold broker-first as a Guam-first brokerage website/app/CRM platform, not only as a generic consumer listing app.

Mike and John’s notes point toward a Real Geeks-style bundle adapted for Guam:

```text
broker-branded website + broker-branded app option + full-market MLS/FlexMLS search + qualified lead capture + lead CRM + future property-management/tenant portal
```

Hafa Homes remains the reference/demo public brand and possible marketplace layer.

## Current main status

Latest `main` after PR #19:

```text
40df781 Merge pull request #19 from Shimizu-Technology/feature/buyer-search-profile-prompts
```

Current product maturity:

```text
credible broker-platform demo with first-party lead intent + buyer/search profile personalization
```

Still not yet:

```text
production-ready Real Geeks replacement with live MLS/FlexMLS feed and broker-owned domains
```

Current iOS App Store state:

```text
iOS version 1.0.1
build 11
status: approved/live
```

Android public release is planned but not started. See `docs/android-play-store-release-plan.md`.

## What is now shipped / working

### Consumer web/mobile

- Public browsing on web/PWA and Expo mobile.
- Buy/rent listing search, map/list browsing, detail pages, Local Intel, mortgage calculator.
- Server-backed saved homes for signed-in users.
- Showing/contact requests remain public and low-friction.
- Signed-in requests attach `user_id` server-side.
- Consumer request history on web/mobile.
- Account/profile settings with phone and preferred contact.
- Durable Buyer/Search Profile fields:
  - preferred contact/phone snapshot;
  - prequalification/lender;
  - timeline;
  - budget range;
  - desired villages/beds/baths;
  - buyer/renter status;
  - agent relationship;
  - notes.
- Showing, price watch, and search-assist flows prefill from account/search profile without overwriting user edits after a sheet/modal opens.

### Auth / roles / safety

- Clerk-backed auth across Rails API, React web, and Expo mobile.
- Rails owns authorization/roles/tenant scoping.
- Roles:
  - `platform_admin`
  - `brokerage_admin`
  - `agent`
  - `consumer`
- Staff/admin routes are protected and tenant-scoped.
- Public lead creation cannot spoof trusted internal assignment fields:
  - `user_id`
  - `brokerage_id`
  - `assigned_agent_id`
  - `quality_score`
- Anonymous intent sessions stay anonymous and are not claimed by later sign-ins.

### Broker platform foundation

- `Brokerage`, `Agent`, and `BrokerageMembership` models.
- Listing attribution separated from lead routing:
  - `Listing.agent` / `Listing.brokerage` = MLS/listing attribution.
  - `Lead.requested_agent` = consumer preference.
  - `Lead.assigned_agent` = CRM owner.
  - `Lead.brokerage` = app/routing brokerage.
- Public active agents API, web Agents page, mobile Agents tab.
- Preferred-agent selection is sign-in gated.
- No-preference leads stay in the brokerage queue instead of auto-assigning the listing agent.

### Broker/admin CRM

- Admin dashboard, lead inbox/detail, users, showings, audit history, data sync surfaces.
- Lead status and assigned-agent filtering/search/sorting.
- Lead type differentiation:
  - showing request;
  - price watch request;
  - search assist;
  - general inquiry.
- Showing appointments.
- Lead notes, tasks, activity timeline, archive/edit controls.
- Qualified lead capture and server-derived quality score labels: Hot/Warm/Early/Unqualified.
- Staff-only current Search Profile context on lead detail.
- Search intent snapshots attached to converted leads.
- Staff-only search intent dashboard for active/unconverted first-party sessions.

### First-party intent and prompts

- Rails-backed `LeadIntentSession` and `LeadIntentEvent` tracking.
- Intent events for listing views, saved homes, search filters, map markers, form opens/abandons, agent selection, and saved searches.
- Broker-configurable prompt intensity.
- Progressive search-assist prompt on web/mobile.
- Meaningful intent guardrails before linking sessions to leads.
- Buyer/Search Profile prompt personalization:
  - anonymous/no profile -> current search-assist prompt;
  - signed-in incomplete profile -> finish profile prompt;
  - signed-in complete profile -> suppress long prompt;
  - behavior divergence -> update-profile prompt;
  - profile prompts save profile by default and create CRM lead only when the user explicitly asks for agent follow-up.

### Notifications

- `NotificationDelivery` logs notification attempts.
- Resend email and ClickSend SMS supported behind explicit env gates.
- Local/dev live sends off by default.
- Guam phone normalization implemented.
- Production notification sending still depends on DNS/API keys/live flags/background worker readiness.

## Important limitations / blockers

### MLS / listing data

Real production listing data is still blocked on MLS/FlexMLS/GAR authorization and compliance.

Open questions:

- Can Hafa Homes be approved as a vendor/app for participating Guam brokerages?
- Can one brokerage authorize access, or do multiple brokers each authorize feeds?
- Feed type: IDX, FlexMLS IDX, RESO Web API, RETS, CSV/XML, iframe/embed, or another approved method?
- What attribution, disclaimer, refresh, sold/rented status, registration-wall, and photo caching rules apply?
- Can broker-branded apps show all authorized Guam listings?
- Are there lead-routing restrictions for other brokerages’ listings?

### Production/demo readiness

Before relying on the latest merged platform in production demos:

- deploy latest API;
- run production migrations through PR #19;
- deploy latest web;
- verify background jobs;
- verify Clerk roles/staff access;
- verify saved homes and account/search profile;
- verify showing/price/search-assist lead creation;
- verify search intent dashboard;
- refresh mobile/TestFlight build if needed;
- verify notification gates/config.

### Notifications

Production sending still requires:

- Resend domain/DNS/API key/from-address setup;
- ClickSend production credentials;
- live env flags intentionally enabled;
- background worker readiness.

Future follow-up:

- Resend webhook status updates;
- ClickSend delivery receipt sync;
- notification preferences;
- app-first universal links for requests/listings.

### Broker-specific apps

Broker-branded iOS apps may trigger Apple white-label/template scrutiny. Broker-branded apps may need materially distinct branding/features and/or broker-owned Apple developer accounts.

## Known hardening follow-up

### Lead intent prompt analytics atomicity

Non-blocking issue documented from PR #19 Greptile review:

`LeadIntentSession#prompt_payload` currently writes prompt analytics/cadence state in two separate writes:

1. `lead_intent_sessions.last_prompt_key`
2. `buyer_search_profiles.last_prompted_at`

Risk:

- If the server crashes between those writes, analytics/cadence metadata can become inconsistent.
- This does not expose data, break auth, break lead creation, or affect core lead routing.
- Worst case is imperfect prompt analytics or prompt cadence metadata.

Recommended fix when hardening prompt analytics:

- wrap both writes in a transaction;
- ideally make the prompt-state update method explicit, e.g. `record_prompt_shown!(prompt_key:, profile:)`;
- keep `profile.update_column(:last_prompted_at, ...)` inside the same transaction or move profile prompt cadence into one canonical table if prompt analytics becomes mission-critical;
- clean up/document the unused `trigger` parameter in `search_profile_prompt_context` if still unused.

Priority:

```text
P3 / non-blocking hardening
```

Handle in a small follow-up PR only if prompt analytics/cadence reliability becomes important before broker demos.

## Product assessment after PR #19

### What Hafa Homes can credibly demo now

- A polished Guam-first consumer search app/web experience.
- Signed-in saved homes and durable buyer/search profile.
- Showing and price watch request capture.
- Search-assist prompts based on real first-party browsing intent.
- Profile-first prompt behavior that avoids repeatedly asking completed users the same long form.
- Broker/admin lead inbox with qualification, lead type, routing, assignment, and intent context.
- Lead CRM workspace: notes, tasks, timeline, showing schedule, notification history, current search profile context.
- Configurable lead prompt intensity for different brokerage appetite.

### What it cannot honestly claim yet

- Real MLS/FlexMLS integration.
- Broker-owned custom domains.
- Production-ready broker-branded websites.
- Broker-branded app builds.
- Automated price-change notifications.
- Automated lead verification/drip campaigns.
- Full property-management/tenant portal.
- Production notification sending until Resend/ClickSend/live worker config is complete.

## Recommended next work

### Immediate local/product track

1. **Production/demo hardening for current `main`**
   - deploy latest API/web;
   - run migrations;
   - smoke account/search profile, prompts, lead creation, admin inbox, mobile;
   - prepare demo accounts/data.

2. **Android Play Store release**
   - now that PR #19 is merged, Android is unblocked from a product-flow standpoint;
   - follow `docs/android-play-store-release-plan.md`.

3. **Broker pitch/package materials**
   - one-page pitch;
   - package tiers;
   - pricing hypotheses;
   - demo script;
   - Real Geeks comparison;
   - MLS/FlexMLS FAQ;
   - “local platform provider, not a brokerage and not a marketing agency” positioning.

### Next product build track

4. **Domain-first broker-branded foundation**
   - `BrokerageDomain`;
   - host-based tenant resolver;
   - brokerage branding config;
   - broker homepage/profile;
   - brokerage-scoped search/listing/agents surfaces;
   - brokerage-routed lead forms;
   - slug preview fallback for dev/demo.

5. **Lead quality / CRM automation**
   - duplicate lead detection;
   - phone/email verification badges;
   - speed-to-lead reminders;
   - notification preferences;
   - CSV export;
   - agent performance/follow-up reporting.

6. **Property-management preview**
   - managed properties;
   - tenant list;
   - lease/date/file placeholders;
   - maintenance request preview;
   - rent status/payment concept.

7. **MLS/FlexMLS integration path**
   - only after broker/GAR/FlexMLS authorization path is clear;
   - start with provider adapter + sample authorized data + sync logging.

## Mike/John meeting-derived business homework

- Keep broker-first, not agent-first.
- Keep Hafa Homes positioned as a technology/platform provider, not a brokerage and not a marketing agency.
- Show enough working product that broker discovery is about real feedback, not a fantasy idea.
- Make the demo prove qualified leads, not just listing browsing.
- Prepare 3 package tiers:
  1. Brokerage Website/App/Search.
  2. Engagement/Lead CRM.
  3. Property Management/Tenant Portal.
- Draft setup + monthly pricing ranges.
- Build target broker discovery list.
- Prepare questions for Carl / Clare Delgado / Bawar / GAR.
- Schedule trusted broker feedback with Sam or another experienced broker contact.
- Decide first pilot broker target.

## Suggested demo story

1. “Here is Hafa Homes, the reference Guam-first app.”
2. “Here is how a buyer/renter searches, saves, chooses a preferred agent, and requests help.”
3. “Here is how profile-first prompts capture useful readiness without annoying completed users.”
4. “Here is the broker/admin side where the lead lands with search intent, qualification, and routing context.”
5. “Here is the CRM follow-up workspace: notes, tasks, timeline, showing schedule, notification history.”
6. “Next, this same platform powers your brokerage-owned domain and app experience.”
7. “MLS/FlexMLS access plugs in once your brokerage authorizes the feed.”
