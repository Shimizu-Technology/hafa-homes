# Hafa Homes review findings and remediation plan

_Canonical review date: 2026-08-16_

This document records the second full product, code, operations, business-context, competitor, and pull-request review of Hafa Homes. It explains what the product is, why it exists, which conclusions are evidence-backed, what PR #21 does and does not accomplish, and the order in which remaining work should be completed.

It supplements `current-product-truth.md`. Historical plans remain useful context, but they do not override current implementation evidence or the launch gates below.

## Executive conclusion

Hafa Homes should continue as a **Guam-first, broker-branded customer and lead-intelligence platform**, with Hafa Homes itself serving as the reference/demo brand. It should not presently be sold as a finished Real Geeks replacement, a live MLS product, or a turnkey white-label platform.

PR #21 is strategically and technically legitimate. It closes real brokerage-isolation and product-truth gaps and should be kept. Its correct description is:

> A multi-tenant routing, brokerage-isolation, runtime web-branding, privacy, and UX foundation.

It is not yet proof of:

- end-to-end deploy-preview readiness;
- live MLS or IDX compliance;
- turnkey per-broker web/mobile branding;
- operational notification and retention workers;
- a signed brokerage pilot or proven willingness to pay.

The engineering should be hardened enough to preserve the asset, but major new founder investment remains gated by a named pilot, authorized data path, pricing, partner terms, and operational ownership.

## What Hafa Homes is

Hafa Homes is one shared product platform with three surfaces:

- a React/Vite consumer web/PWA and staff/admin CRM;
- an Expo iOS/Android consumer app;
- a Rails/PostgreSQL/PostGIS API that owns listings, brokerage routing, users, intent, leads, CRM records, notifications, and future feed adapters.

The current product can credibly demonstrate:

- Guam-focused buy/rent browsing, maps, filters, listing details, and Local Intel;
- public, progressively qualified showing, price-watch, search-assist, and contact requests;
- Clerk accounts, saved homes, buyer/search profiles, request history, and account deletion;
- first-party search-intent tracking and prompts;
- brokerage-scoped agents, profiles, intent, leads, tasks, showings, staff access, and audit records;
- lead qualification, assignment, notes, tasks, activities, showings, notification logs, and admin operations;
- domain-based web routing and build-configured native brokerage routing.

The listing inventory is still demonstration data. Price watch is still a human follow-up request, not an automated listing-change alert. MLS synchronization is still architecture, not a production integration.

## Why it was built

The initial spark was Mike’s use of Locations Hawaii and the opportunity for a much better Guam-specific consumer property experience. Discovery with Mike and John then sharpened the product into a broker-first platform: use consumer search and local utility to create higher-quality first-party leads, and give a brokerage the CRM context needed to act on them.

The partner contribution model discussed in the June meeting and confirmed in the August Brain Dump state is:

- Leon Shimizu: product and technical lead — 40%;
- John Ilao: sales/business/operations partner — 25%;
- Michael “Mike” Sakazaki: sales/business/relationships partner — 25%;
- project reserve for taxes, software, hardware, and other expenses — 10%.

That intended split is context, not a substitute for a signed operating agreement covering equity, IP, decisions, expenses, distributions, departure, and dissolution.

### Primary evidence

Repository sources:

- `docs/meetings/2026-06-01-ssi-automation-hafa-homes.md`
- `docs/meetings/2026-06-05-broker-feedback-realgeeks.md`
- `docs/product/product-brief.md`
- `docs/product/platform-strategy.md`
- `docs/product/current-product-truth.md`
- `docs/research/locations-llc.md`
- `docs/research/realgeeks-competitive-analysis.md`

Brain Dump sources:

- `work/shimizu-tech/SSI-Automation/1) 1st Meeting with Mike and John for SSI Automation.md`
- `work/shimizu-tech/SSI-Automation/2) Meeting with Mike and John for HafaHomes.md`
- `work/shimizu-tech/Michael Sazaki (BOH)/2) Talk with Mike about HafaHomes and Shimizu Technology - May 24, 2026.md`
- `work/shimizu-tech/shimizu-csg-current-state-2026-08-02.md`
- `work/shimizu-tech/shimizu-revenue-collections-tracker-2026-07-07.md`

The August state and revenue tracker are decisive: Hafa Homes is an equity/product opportunity, not a receivable, and major founder work should pause after hardening until a real pilot, MLS path, pricing, partner terms, and money flow exist.

## Revalidated findings

### What is strong

| Finding | Evidence | Why it matters |
| --- | --- | --- |
| Broker-first positioning is the correct wedge | Mike/John meeting notes and current CRM implementation | It connects consumer utility to a buyer with budget and a workflow owner. |
| Guam-specific UX is differentiated | Guam filters, Local Intel, relocation/military language, map/list flows | Local context is more defensible than a generic national portal clone. |
| Progressive lead capture is thoughtful | Public browsing, low-friction forms, profile prefills, intent prompts | It avoids destroying consumer utility just to collect a form submission. |
| Attribution and routing are separated correctly | Listing brokerage/agent, requested agent, routing brokerage, assigned CRM agent | This is essential for MLS truth, consumer choice, and broker operations. |
| The CRM is broader than a superficial demo | Leads, qualification, notes, tasks, activities, showings, notifications, users, audits | A broker can evaluate a real workflow rather than a mock dashboard. |
| PR #21 fixes real tenant risks | Domain resolver, scoped profiles/searches, staff lead/task/showing boundaries | Multi-broker data must not depend on the first active database record. |

### What remains weak or unproven

| Finding | Current truth | Consequence |
| --- | --- | --- |
| No authorized production feed | Demo inventory only | No live-MLS claim or public market launch. |
| No named paying pilot | Product interest is not a signed customer | Do not broaden the roadmap without a bounded validation partner. |
| White-labeling is incomplete | Runtime name/logo/two colors and routing exist, but copy, colors, manifests, icons, auth, analytics, links, and native app metadata remain Hafa-specific | Sell the current work as a foundation, not turnkey white-label. |
| Deploy preview is not an application test | The PR preview’s static deploy passed while Clerk, CORS, and the production API contract prevented the app from loading | A Netlify success badge is not end-to-end evidence. Preview/staging setup is intentionally deferred in the current Phase 1 execution. |
| Public abuse controls are absent | Lead, saved-search, and intent endpoints have no application rate limits, CAPTCHA/honeypot, duplicate suppression, or spam policy | Add before paid traffic or a broad public launch. |
| Retention is implemented but not scheduled | Job and rake task exist; no recurring production schedule is configured | Privacy behavior is only real when operations execute it. |
| Background delivery is not operationally proven | Solid Queue and provider gates exist; worker/provider health is not demonstrated | Notifications can remain queued or skipped without operating ownership. |
| Independent human review is missing | PR #21 has automated review but no human approval | A human tenancy/migration review remains a merge prerequisite. |
| Frontend maintainability is degrading | Large web and mobile application files, broad initial bundle, little UI-flow coverage | Refactor incrementally after security and business gates; do not rewrite. |

## Competitor implications

| Product | What it proves | Hafa Homes implication |
| --- | --- | --- |
| Locations Hawaii | Consumers value local stats, history, open houses, alerts, and market expertise | Deep Guam information and useful alerts matter more than cloning a generic property grid. |
| Real Geeks | Brokers buy a mature bundle of site, CRM, marketing, automation, and support | Hafa Homes cannot honestly claim replacement parity yet; win through Guam fit, ownership, integration, and service. |
| Flexmls consumer app/portal | The MLS ecosystem may already provide search, saved listings, and collaboration | The value proposition must extend or integrate with broker workflows instead of duplicating feed basics. |
| GuamHome and LivingOnGuam | Existing Guam sites already cover many local searches and filters | Local filters alone are not a moat. First-party intent, broker workflow, accurate data, and better local guidance must be measurably better. |

The product should initially integrate with a broker’s existing system when practical. Replacing a mature CRM should only become a goal after one real broker proves the Hafa Homes workflow is better for their team.

## PR #21 re-review

PR: `Harden product UX and brokerage isolation`

The PR was open, cleanly mergeable, and based on `codex/harden-product-and-ux` when re-reviewed. Its original four commits addressed:

- product UX and brokerage isolation;
- seed-safe intent tests;
- Brakeman currency;
- tenant-isolation review findings.

The original July checks and Greptile 5/5 were valid for the commit they reviewed. They became stale as dependency advisories and upstream compatibility checks changed. A fresh approval must cover the final current head.

### Legitimate scope in PR #21

- replaces arbitrary brokerage selection with domain/native routing;
- scopes buyer profiles and saved searches by brokerage;
- scopes staff leads, agents, tasks, and showings;
- adds runtime web brokerage context and theme variables;
- makes demo inventory disclosure and progressive forms clearer;
- adds anonymous-intent retention and account-deletion behavior;
- creates root CI/security gates and current-product documentation.

### Important corrected interpretation

The PR is a multi-tenant foundation, not complete white-label delivery. Full white-label work is intentionally a separate, pilot-backed phase.

## Remediation plan

### Phase 1 — Refresh and make PR #21 merge-ready

Goal: preserve and verify the existing tenancy foundation without expanding it into a full white-label or staging project.

Scope:

1. Document this review, product truth, launch gates, and every deferred item.
2. Refresh vulnerable/stale Ruby, web, and mobile dependencies.
3. Remove the expired Clerk exception and move to a supported Clerk package.
4. Align the repository Node runtime and Expo/React Native versions.
5. Make explicit storefront routing authoritative and fail closed for unknown/inactive tenants.
6. Send notification links to the lead brokerage’s primary active domain.
7. Document native brokerage slug, Clerk/CORS/domain needs, migrations, retention, workers, deployment order, and rollback limits.
8. Add regression tests for:
   - two broker domains and conflicting routing signals;
   - unknown/inactive domains and slugs;
   - brokerage-scoped profiles, searches, intent, leads, tasks, and showings;
   - platform-admin cross-tenant behavior;
   - migration backfill and rollback safety;
   - broker-domain notification links;
   - web brokerage headers and local browser/API smoke flows.
9. Run the complete API, web, mobile, security, dependency, build, and runtime gate.
10. Push only intended changes, refresh the PR description/evidence, and repeat Greptile reviews until an explicit 5/5 covers the final head with no actionable threads.

Explicitly excluded by Leon for this execution:

- setting up a staging API/database or functional deploy-preview environment;
- merging PR #21.

Independent human review is not automatable and remains required before merge.

### Phase 2 — Business and pilot gate

Do not start major product expansion until all are written:

- named pilot brokerage and accountable decision-maker;
- authorized MLS/IDX/feed path;
- integration-versus-replacement decision for the broker’s CRM;
- setup fee, monthly price, term, expenses, collections, and revenue flow;
- signed Leon/John/Mike roles, equity, IP, decision rights, and departure terms;
- data ownership, export, termination, support hours, and incident ownership;
- privacy, consent, fair-housing, attribution, and brokerage legal review;
- pilot success metrics and stop/go date.

### Phase 3 — Complete multi-tenant branding

- centralize brand tokens and product copy;
- per-domain manifests, icons, metadata, privacy links, app links, email/SMS identity, and compliance copy;
- choose Clerk satellite-domain or separate-application strategy;
- configure OAuth, Apple, Mapbox, PostHog, CORS, CSP, and allowed-domain behavior;
- build-time native brand, slug, scheme, icons, store metadata, and links;
- prove a second synthetic brokerage end to end.

### Phase 4 — Security, privacy, and operations

- application rate limiting and request-size limits;
- honeypot/CAPTCHA escalation, duplicate suppression, spam review, and provider throttles;
- scheduled retention and auditable deletion runs;
- Solid Queue worker, retry/dead-letter policy, provider health, and operational alerts;
- account-deletion, export, incident, consent, privacy, terms, fair-housing, and support procedures.

### Phase 5 — Maintainability and performance

- split the web and native monoliths by feature/domain;
- lazy-load map and admin surfaces;
- paginate/virtualize large views;
- add browser end-to-end coverage for search, lead creation, account, and admin flows;
- remove unused CSS/assets and normalize typography/design tokens;
- keep changes incremental; do not rewrite the application.

### Phase 6 — Authorized MLS pilot

- implement a provider adapter behind the normalized listing model;
- stage ingestion and reconciliation before public display;
- verify attribution, disclaimers, photos, statuses, deletions, refresh timing, and lead-routing rules;
- give the pilot broker a reconciliation report and acceptance checklist;
- measure data freshness, listing coverage, lead quality, response time, and broker usage.

### Phase 7 — Pilot-backed product depth

- true saved-search and price-change alerts;
- sales/rental stats, price history, open houses, and richer property facts where licensed;
- deeper village, relocation, military, school-source, insurance, and utility guidance;
- consumer-facing agent and brokerage copy approved by the pilot;
- authentic Guam imagery and content rights.

## Merge and launch gates

PR #21 can be considered merge-ready only when:

- the final local gate is green;
- GitHub CI is green on the current head;
- Greptile explicitly reports 5/5 on that head;
- no actionable review thread remains;
- migration and tenant tests pass;
- the PR description accurately records the intentionally deferred preview environment;
- an independent human has reviewed tenancy and migration behavior.

A broker pilot can launch only when:

- Phase 2 is complete;
- the feed is authorized and validated;
- operational workers, retention, providers, privacy, and incident ownership are active;
- broker staff complete acceptance testing;
- demo claims and public copy match the licensed production behavior.

## Decision discipline

Use this order when deciding what to build next:

1. Does it protect tenant data, security, legal truth, or recoverability? Do it.
2. Does the named pilot need it to complete a measured workflow? Consider it.
3. Does it deepen the Guam-specific advantage? Prioritize after pilot basics.
4. Is it only required to imitate a larger competitor? Defer until evidence proves value.

The central risk is no longer whether Hafa Homes can be built. It can. The risk is spending more technical effort than the current business proof justifies.

## Phase 1 completion record

Local Phase 1 verification completed on 2026-08-16:

- API: 26 tests and 98 assertions passed; Zeitwerk, RuboCop, Brakeman, Bundler Audit, and the seeded runtime smoke script passed.
- Web: lint, four Vitest assertions, production build, and the high-severity production dependency audit passed. The build still reports the documented large-bundle warning, which belongs to Phase 5.
- Mobile: TypeScript, Expo Doctor (21/21), the production dependency gate, and Hermes exports for both iOS and Android passed on Node 22.22.3 and Expo SDK 57.
- Runtime/browser: desktop and 390-pixel mobile layouts were exercised against the local Rails API, including sale/rent inventory, listing detail, Local Intel, map clusters, agent directory, and public lead submission. No browser console errors or horizontal overflow remained, and the synthetic lead was removed afterward.
- Security: Ruby and web audits are clear. Mobile's production gate allows only the two current, unpatched `image-size` advisories inherited through Metro's build-time asset tooling. The narrow exception expires 2026-11-16 and rejects any other high/critical advisory.
- Routing/tenancy: automated coverage includes browser-host precedence, conflicting native slugs, unknown/inactive tenant rejection, cross-broker profiles, intent, leads, tasks, and showings, platform-admin access, rollback safety, and broker-domain notification links.

The authoritative final head SHA, GitHub check state, Greptile score, and review-thread state are recorded on PR #21 because embedding a commit's own SHA inside that same commit is not possible. Phase 1 is complete only when that PR evidence covers the current head with a fresh explicit 5/5 and no unresolved actionable threads.

Staging/preview setup and merging remain explicitly deferred. Independent human tenancy/migration review also remains a merge prerequisite.
