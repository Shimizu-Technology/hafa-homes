# Hafa Homes current product truth

_Last verified: 2026-08-31 after iOS `1.0.4 (20)` entered internal TestFlight._

The canonical re-review, findings, rationale, and remediation sequence are in `2026-08-16-review-findings-and-remediation-plan.md`.

This is the canonical, implementation-backed description of Hafa Homes. Older PRDs and meeting plans remain useful historical context, but they do not override this file.

| Capability | Current state | Pilot requirement |
|---|---|---|
| Public web search | Working | Replace demonstration inventory with authorized market data |
| iOS application | `1.0.3 (17)` is live; `1.0.4 (20)` is valid and in internal TestFlight | Complete and explicitly accept the physical-iPhone matrix before broader distribution |
| Android | Expo codebase works cross-platform; no public release | Play Console release and policy completion |
| Listing inventory | Demonstration facts and stock imagery, visibly labeled | Written MLS/IDX/feed authorization and compliant attribution |
| Brokerage routing | Domain/native-slug resolution implemented | Add the pilot's approved domains and build-time native slug |
| Full-market search | Shared market inventory by design | Confirm the broker's rights to display the chosen feed |
| Runtime web branding | Brokerage context and two core brand colors are resolved by domain; substantial Hafa-specific copy/assets remain | Complete the pilot-backed branding phase before calling the platform turnkey white-label |
| Agent directory | Working and brokerage-scoped | Import approved broker agents and licenses |
| Showing and price-watch requests | Working without forced registration | Configure notification providers and broker recipients |
| Price watch | Human follow-up request | Automated price-change alerts remain future work |
| Saved homes | Working for signed-in users | No external blocker |
| Connected records | Exact consumer requests, listings, villages, storefront agents, staff leads/showings, and brokerage customer workspaces have scoped reciprocal navigation | Add only workflow-backed records; keep growing collections bounded and pageable |
| Buyer/search profile | Working and brokerage-scoped | Broker privacy/retention review |
| First-party intent | Working with progressive prompts and retention pruning | Schedule pruning and calibrate prompt settings with pilot data |
| Broker CRM | Leads, assignments, notes, tasks, activities, showings, notifications, users, and audit views work | Pilot role mapping, training, and acceptance testing |
| Account deletion | Local PII is tombstoned before provider deletion, recreation is blocked, and provider cleanup is retried durably | Monitor the reconciliation job and complete broker/legal retention review |
| Consumer notifications | Lead/showing delivery intents are transactional and reconciled; new links use canonical HTTPS record URLs; the Håfa Homes Apple association file is deployed and verified through Apple's CDN | Enable verified providers/domains and validate notification-to-installed-app behavior on a physical iPhone before broader distribution |
| MLS synchronization | Monitor/data concepts only | Provider adapter, credentials, reconciliation, and compliance rules |
| Property management | Not implemented | Explicitly deferred until search/CRM pilot validation |

## Product boundaries

- Hafa Homes is a technology platform, not a brokerage or MLS.
- Listing attribution and the brokerage receiving a consumer request are separate concepts.
- Intent scoring is a readiness signal based on first-party behavior and submitted details; it is not identity, financing, or phone verification.
- Public browsing remains available. Qualification is progressively disclosed rather than required before search.
- Multi-broker privacy boundaries apply to domains, agents, profiles, intent, leads, staff, and CRM data. Authorized full-market listing inventory may be shared across broker storefronts.

## External launch gates

The repository cannot complete these without a business decision or third-party approval:

1. Select and contract with a pilot broker.
2. Obtain written MLS/IDX/feed authorization and production data credentials.
3. Approve pricing, revenue ownership, decision rights, support limits, and customer contract ownership.
4. Configure production notification providers and verified sending domains.
5. Choose a hosting plan that avoids demo-impacting cold starts.
6. Complete legal review of the broker-facing privacy notice, retention policy, and listing disclaimers.

## Engineering quality gate

The root CI workflow runs API tests, autoload validation, Brakeman, Bundler Audit, RuboCop, web lint/test/build/audit, mobile type checking, Expo Doctor, and a production dependency policy. The August refresh removes the expired Clerk advisory exception by moving to the supported Clerk Core 3 Expo package. Any remaining temporary exception must identify a currently unpatched upstream advisory, explain why its affected surface is outside the shipped runtime, include an expiry date, and continue failing every unaccepted high/critical advisory.

For a deployment that already has more than one active brokerage, audit the owner of legacy buyer profiles and saved searches before running the brokerage-scope migrations. Set `LEGACY_BROKERAGE_SLUG` to that verified active brokerage for the migration run. If ownership is not explicit and the database does not have exactly one active brokerage, the migrations stop without backfilling rather than silently assigning customer data to an arbitrary tenant.
