# Mike/John Next Build Plan

_Last updated: 2026-06-27 after PR #18 progressive prompt follow-up planning._

## Source context

Primary meeting transcript:

```text
/Users/leonshimizu/Desktop/ShimizuTechnology/Brain-Dump/work/shimizu-tech/SSI-Automation/2) Meeting with Mike and John for HafaHomes.md
```

Related product docs:

- `docs/product/agent-selection-lead-routing-plan.md`
- `docs/product/brokerage-mls-attribution-routing-questions.md`
- `docs/product/broker-branded-layer-plan.md`
- `docs/product/buyer-search-profile-prompt-plan.md`
- `docs/product/august-1-demo-plan.md`
- `docs/product/platform-strategy.md`
- `docs/research/realgeeks-competitive-analysis.md`

## Current product direction

Hafa Homes should be sold as a **local platform provider** for Guam brokerages, not as a brokerage and not as a generic marketing agency.

The pitch:

> Hafa Homes can power a broker's website, app, search, lead capture, and CRM funnel while keeping the broker's brand and customer relationships front-and-center.

The Real Geeks-style replacement story is:

```text
broker-owned domain + broker-branded website/app + full-market listing search + qualified lead capture + CRM follow-up
```

Hafa Homes remains the reference/demo brand and possible public marketplace layer.

## Decisions from the Mike/John discussion

### 1. Full-market MLS/FlexMLS search is the right model

Broker-branded experiences should eventually show all authorized Guam MLS/FlexMLS inventory, not only the brokerage's own listings.

Keep these separate:

```text
Listing.agent       = MLS/listing attribution / Listed by
Listing.brokerage   = MLS/listing office/brokerage
Lead.requested_agent = customer-selected preferred/buyer-side agent
Lead.assigned_agent  = CRM owner responsible for follow-up
Lead.brokerage       = app/routing brokerage that owns the customer relationship
```

This was implemented in PR #16.

### 2. Lead quality matters more than raw lead volume

Mike's key concern was not just getting more leads. It was avoiding low-intent leads like:

```text
How much?
Is this available?
```

The product should help agents identify people who are actually ready or likely to transact.

### 3. The platform needs lightweight qualification prompts

The app should gather just enough information for an agent to have a productive first call, without making users abandon the flow.

Examples:

- Are you prequalified?
- Are you working with a lender/bank?
- What is your timeline?
- What villages/areas are you considering?
- What price range?
- Beds/baths?
- Buying/renting/selling/relocating?
- Are you already working with an agent?

### 4. Web and mobile customer surfaces should stay functionally aligned

The meeting reinforced that the customer-facing website and app should generally feel equivalent unless we intentionally use web to push app installs later.

Current rule:

- public browsing remains open on both;
- saved homes require sign-in;
- preferred-agent selection requires sign-in;
- showing/price requests stay low-friction and public, but signed-in requests attach the user automatically.

### 5. Brokerages may need different lead-capture packages

Newer agents may want more lead volume and earlier prompts.

Experienced brokers/agents may want stronger lead quality and less noise.

This suggests package/config options later:

- prompt after X listing views;
- require qualification before showing request;
- allow low-friction brokerage-queue requests;
- qualify only for high-value listings/searches;
- lead scoring thresholds.

### 6. Domain-first broker-branded platform is a major differentiator

Brokers are more likely to buy:

```text
We can power your existing brokerage website and CRM funnel.
```

than:

```text
You get a page on Hafa Homes.
```

This is covered in `docs/product/broker-branded-layer-plan.md` and should follow the qualified-lead foundation.

## What already shipped

Merged PR #16:

- public active agents API;
- web `/agents` page;
- mobile Agents tab;
- sign-in-gated preferred-agent selection;
- listing attribution separated from preferred/requested agent;
- `Lead.requested_agent` added;
- `Lead.brokerage` treated as routing/app brokerage;
- no-preference leads stay unassigned/in brokerage queue;
- backend rejects public spoofing of `brokerage_id`, `assigned_agent_id`, `user_id`, and invalid `requested_agent_id`;
- admin lead filters for assigned/unassigned agents;
- docs for MLS attribution/routing questions.

## Immediate next PR: qualified lead capture

Recommended branch:

```bash
feature/qualified-lead-capture
```

### Goal

Turn showing/price inquiries into more useful CRM records by capturing buyer/renter readiness and search intent.

### V1 fields added in `feature/qualified-lead-capture`

Use concise fields that work for both buyers and renters:

```text
prequalified_status       yes / no / in_progress / not_sure
lender_name               free text, optional
timeline                  asap / 1_3_months / 3_6_months / 6_plus_months / just_browsing
budget_min                numeric, optional
budget_max                numeric, optional
desired_villages          array or text/json, optional
desired_beds              integer, optional
desired_baths             decimal/integer, optional
buyer_status              first_time / upgrading / relocating / investor / renter / military / other
already_working_with_agent yes / no / not_sure
qualification_notes       text, optional
quality_score             server-derived 0–100 readiness score
quality_status            existing staff-reviewed field remains unknown/verified/unverified/duplicate/spam
```

V1 scoring is intentionally simple and server-derived. It helps admins quickly sort Hot/Warm/Early/Unqualified leads, but the raw answers remain more important than the number.

### Consumer UX

Start with the showing request and price alert forms.

Principles:

- keep required fields minimal;
- prefill from profile when signed in;
- ask 3–5 qualification prompts max in the first pass;
- make sensitive questions optional;
- copy should explain that this helps the agent follow up with better matches.

Potential V1 required fields:

- name;
- email;
- request type/listing;
- timeline or prequalified status.

Potential optional fields:

- lender/bank;
- price range;
- villages;
- beds/baths;
- notes.

### Admin CRM UX

Lead cards/detail should show:

- requested agent;
- assigned agent;
- lead brokerage/routing brokerage;
- qualification summary;
- prequalified status;
- timeline;
- budget range;
- desired villages;
- buyer/renter status;
- already working with agent;
- call-prep summary.

Example admin summary:

```text
Warm buyer: prequalification in progress, wants Dededo/Yigo, $450k–$575k, 3+ beds, timeline 1–3 months, not already working with an agent.
```

### Backend safety rules

Public create should still not allow spoofing:

- `user_id`;
- `brokerage_id`;
- `assigned_agent_id`;
- internal staff-only quality fields if any.

Qualification answers can be public-safe fields on lead create.

If adding derived `quality_score`, calculate it server-side.

### Definition of done

- [x] Migration/model fields added.
- [x] Lead create accepts public-safe qualification fields.
- [x] Web showing request captures V1 fields.
- [x] Web price alert captures a compact readiness set.
- [x] Mobile showing request captures V1 fields.
- [x] Mobile price alert captures a compact readiness set.
- [x] Admin lead list/detail display qualification summary and Hot/Warm/Early/Unqualified score.
- [x] Consumer request history shows user-safe readiness summary only when qualification details exist.
- [x] API validation/build/typecheck pass locally.

## Next after qualified lead capture

### 1. Progressive prompts and first-party lead intent tracking

Branch:

```bash
feature/progressive-lead-prompts
```

Add behavior-aware conversion prompts without relying on PostHog or third-party analytics as CRM source-of-truth:

- after 3 listing views;
- after saving a home;
- after repeated village/search interest;
- after returning to a listing;
- after opening request modal but not submitting.

Potential prompts:

```text
Want a Hafa Homes agent to send similar listings?
Want to save this search?
Want help narrowing homes near Andersen/Navy Base?
```

Track first-party activity in Rails and attach it to converted leads:

- listing views;
- saved listings;
- search filters;
- villages viewed;
- repeat visits;
- request started/submitted;
- request abandoned;
- preferred-agent selection.

V1 should create a normal `search_assist` lead when the prompt converts, show admin CRM context such as viewed listings, top villages, viewed price range, saved homes, and trigger reason, and include a staff-only search-intent dashboard for active/unconverted sessions. Signed-in shoppers can be identified for appropriate follow-up; anonymous sessions remain anonymous until they submit a lead.

### 2. Buyer/search profile settings and prompt personalization

Recommended follow-up branch:

```bash
feature/buyer-search-profile-prompts
```

The same readiness/search fields collected by progressive prompts should become a durable signed-in search profile that users can edit on web and mobile.

Build:

- signed-in buyer/search profile API;
- web `/account` search profile card;
- mobile account/search profile screen;
- form prefill for showing, price, and search-assist flows;
- prompt rules that suppress the long qualification prompt when a user already has a complete profile;
- lighter “finish/update your search profile” prompts for incomplete or changed preferences;
- lead snapshots that preserve answers at submission time.

Important prompt rule:

```text
Anonymous/no profile -> current qualification prompt.
Signed-in incomplete profile -> finish/search profile prompt.
Signed-in complete profile -> no long prompt; only lightweight contextual CTA or profile-update prompt when behavior changes.
```

See `docs/product/buyer-search-profile-prompt-plan.md`.

### 3. Domain-first broker-branded foundation

Recommended branch:

```bash
feature/broker-domain-foundation
```

Build:

- `BrokerageDomain`;
- host-based tenant resolver;
- brokerage branding config;
- broker homepage/profile;
- agent roster/profile pages;
- broker-owned domain story;
- slug fallback for preview/dev only.

### 4. Broker pitch/package docs

Mike and John need broker-facing materials:

- one-page pitch;
- package tiers;
- pricing hypotheses;
- demo script;
- Real Geeks comparison;
- MLS/FlexMLS FAQ;
- “local platform provider, not a brokerage” positioning;
- customization/support story.

### 5. Production/demo hardening

Before serious broker demos:

- deploy latest API and web;
- run production migrations;
- verify background jobs;
- verify Clerk/auth roles;
- verify saved homes;
- verify agent routing;
- verify showing/price request lead creation;
- refresh mobile/TestFlight build if needed;
- seed realistic demo broker/agent/listing data;
- ensure notification sends remain gated unless intentionally enabled.

### 6. MLS/FlexMLS/GAR discovery

Questions still needing real answers:

- Can a Guam broker authorize Hafa Homes as a third-party vendor/app?
- Which data path is available: IDX, FlexMLS IDX, RESO Web API, RETS, iframe/embed, CSV/XML, or other?
- What attribution/disclaimer/update timestamp/photo rules apply?
- Can a broker-branded app show all Guam MLS listings?
- Are there lead routing restrictions for other brokerages' listings?

### 7. Property-management preview

Later premium-tier demo, not next:

- managed properties;
- tenant list;
- lease/date placeholders;
- rent status placeholder;
- document placeholder;
- future online payments note.

### 8. Property/data intelligence research

Longer-term possible product line inspired by Ryan/title-data discussion:

- ownership history;
- land ownership;
- tax map key/property profile;
- lender/note visibility where legal/available;
- purchase/refinance signals.

This depends heavily on data access and should not block the brokerage website/app/CRM path.

## Recommended build order

```text
1. Qualified lead capture
2. Progressive prompts + first-party intent tracking
3. Buyer/search profile settings + prompt personalization
4. Production/demo hardening for current merged platform
5. Broker pitch/package docs
6. Domain-first broker-branded foundation
7. MLS/FlexMLS integration path once authorized
8. Property-management preview
9. Property/data intelligence research
```
