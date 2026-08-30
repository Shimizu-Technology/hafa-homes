# Connected record architecture

## Decision

Håfa Homes should use connected record architecture where a durable product object has a clear user workflow. This is a navigation, authorization, and projection strategy. It is not a graph-database migration, a generic relationship engine, or a reason to give every table its own page.

The product already has the relational foundation it needs. The work is to give important records stable homes, expose safe relationships, preserve return context, and keep every related projection inside the same authorization boundary as its source record.

## Why it fits Håfa Homes

Consumers move between searches, listings, saved homes, requests, agents, villages, and showing appointments. Brokerage staff move between customers, leads, listings, agents, showings, tasks, activities, and audit evidence. These are repeated record journeys, not isolated screens.

The existing staff lead detail page proves the pattern: it composes related information around one authorized lead instead of loading an unbounded object graph. The public listing-to-lead return path is another working example.

## Record and tenancy rules

These distinctions are product rules, not presentation details:

- Public listing inventory is full-market inventory. A listing's agent and brokerage are MLS attribution.
- The public agent directory is scoped to the active brokerage storefront. A storefront agent may be selectable for a request.
- `Lead.requested_agent` is the consumer's preference.
- `Lead.assigned_agent` is the staff member coordinating the CRM relationship.
- `Lead.brokerage` owns the storefront conversation and its private request history.
- Consumer request history is scoped by both the signed-in user and the active routing brokerage.
- A future staff customer workspace must use the composite identity `(brokerage_id, user_id)`. It must not expose a global user record to brokerage staff.
- Anonymous leads must not be merged into a signed-in customer workspace by email alone.

The UI must keep listing attribution separate from requested and assigned agents. External attribution agents must not automatically become links to storefront agent records or choices in request forms.

## Stable record homes

### Implemented foundation

- Listing: `/listings/:id`
- Village: `/villages/:slug`
- Staff lead: `/admin/leads/:id`
- Consumer request API: `GET /api/v1/me/leads/:id`, scoped to the signed-in user and active storefront brokerage
- Validated internal `return_to` route helpers for listings, requests, agents, staff leads, and showings

### First connected consumer slice

- Consumer request: `/account/requests/:id`
- Request history links to the exact request and preserves the current pagination URL.
- The request record presents its stable identity, consumer-safe status, request facts, related listing, showing appointments, requested agent, assigned agent, and conversation-owning brokerage.
- Opening the related listing carries a validated return path back to the exact request.
- Listing detail honors that return path on desktop and mobile web.
- Consumer email and SMS notifications target the exact request instead of the generic request collection.

The consumer projection does not include staff notes, internal showing notes, delivery logs, lead scores, source campaigns, audit evidence, or staff activity history.

## Planned slices

1. Native mobile request detail and exact cold/warm deep links for requests and listings.
2. Stable staff showing records with reciprocal lead and listing journeys.
3. URL-backed non-PII operational filters and safe return context in the CRM.
4. A brokerage-scoped customer workspace that joins the customer's authorized requests and profile context without crossing brokerage boundaries.
5. A storefront-scoped public agent record, linked only when the agent belongs to the active routing brokerage.
6. Bounded related-record summaries with separately pageable collections as volume grows.

## Deliberate deferrals

- Do not implement “assign houses to agents” until partners distinguish MLS attribution, lead assignment, manual/off-market inventory ownership, and property-management assignment.
- Do not create a generic public page for every MLS attribution agent.
- Do not create a standalone saved-search record until ownership, verification, lifecycle, and edit/delete rules are settled.
- Do not create a global staff user/customer page.
- Do not use raw names, emails, phone numbers, or CRM search text in URL state or analytics payloads.
- Do not replace ordinary relational queries with a graph database.

## Record-page contract

Every first-class connected record must provide:

1. Stable identity and canonical route.
2. Authorization based on the record's real ownership boundary.
3. A bounded summary projection rather than an unbounded relationship graph.
4. Clear relationship labels that describe the domain role.
5. Safe reciprocal navigation where the destination is authorized and meaningful.
6. A validated return path or a deterministic fallback.
7. Useful loading, unavailable, empty, and unauthorized states.
8. Direct-access, refresh, browser-back, and cold-link tests.

## Security and analytics contract

- Explicit unknown or inactive brokerage domains and native slugs fail closed.
- A record lookup must scope before it selects by id; it must not load globally and authorize afterward.
- A related count or preview must use the same scope as the destination collection.
- `return_to` accepts only same-origin absolute paths beginning with one slash. External and protocol-relative destinations fall back safely.
- Protected `/account` and `/admin` routes are excluded from public page-view analytics.
- Connected CRM work must not put PII-shaped free text into URLs.
- Notification links use the lead's brokerage primary domain so the same tenant boundary is resolved before the record is loaded.

## Verification expectations

Each slice must include:

- authorization tests for the owning storefront and at least one cross-broker denial;
- direct record access and not-found behavior;
- reciprocal navigation and preserved return context;
- desktop and phone-width browser checks;
- native cold-start and warm-link checks for mobile routes;
- regression checks that listing attribution is not presented as CRM assignment;
- bounded API response tests when a relationship can grow.

The connected architecture is complete only when these journeys work across the API, web, native app, notifications, authorization rules, and release configuration. A new route by itself is not completion.
