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
- The staff customer workspace uses the composite identity `(brokerage_id, user_id)`. It does not expose a global user record to brokerage staff.
- Anonymous leads must not be merged into a signed-in customer workspace by email alone.

The UI must keep listing attribution separate from requested and assigned agents. External attribution agents must not automatically become links to storefront agent records or choices in request forms.

## Stable record homes

### Implemented foundation

- Listing: `/listings/:id`
- Village: `/villages/:slug`
- Staff lead: `/admin/leads/:id`
- Brokerage customer workspace: `/admin/brokerages/:brokerage_id/customers/:user_id`
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

### Native connected consumer slice

- The native app accepts exact cold-start and warm links for `/account/requests/:id`, `/requests/:id`, and `/listings/:id` through the `hafahomes` scheme.
- Signed-out request links stop at the request-history sign-in boundary. After authentication, the exact request is loaded through the same user-and-storefront-scoped API as the web record.
- The native request record shows consumer-safe status, all consumer-visible showing appointments, requested and assigned agent roles, the conversation-owning brokerage, and a reciprocal related-listing action.
- Exact listing links fetch the requested record independently of the current search page and show a bounded unavailable notice when the listing cannot be opened.
- Incoming link handling ignores stale asynchronous listing results after a newer link or navigation target takes precedence.
- Mobile CI exercises exact request/listing targets, both custom-scheme path forms, request-vs-account routing order, navigation-generation invalidation, and per-request remount keys.

## Implemented staff slice

### Staff showing slice

- Staff showing: `/admin/showings/:id`, authorized through the existing brokerage-and-assignment-aware staff showing scope.
- The schedule and dashboard link to the exact showing. Schedule pagination is URL-backed and preserved as return context.
- The record separates customer-visible notes from internal notes and presents the appointment timezone, coordination roles, customer summary, and related listing.
- The lead scheduler renders existing datetime inputs in the appointment's saved timezone and preserves that timezone on update.
- Related lead and listing links carry a validated return path to the exact showing; the lead workspace honors that return path.
- Only the exact staff detail serializer adds a bounded lead summary; collection and consumer projections never construct that nested PII. The consumer serializer also removes internal notes and creator data.

### Brokerage customer workspace slice

- The customer workspace uses the composite identity `(brokerage_id, user_id)` and is available only when the current staff lead scope contains at least one request for that exact pair.
- Brokerage administrators see that brokerage's customer requests. Agents see only requests assigned inside their existing lead scope. Platform administrators retain explicit cross-broker access while the route still names the brokerage context.
- The workspace composes the signed-in customer identity, brokerage-scoped buyer search profile, bounded request summaries, and counts derived from the same authorized request relation.
- Anonymous requests remain lead records and are never joined to an account because an email address happens to match.
- Lead inbox status, type, assigned-agent, sort, and pagination state are URL-backed and survive exact-record navigation. Free-text CRM search stays in memory and is removed from canonical/return URLs because it can contain names, emails, and phone numbers.
- Lead inbox, lead detail, and customer workspace link in both directions through centralized route builders. Nested validated `return_to` values preserve the original filtered inbox when staff move through a customer and multiple related requests.
- Customer request collections are independently paginated at ten records per page. The workspace does not serialize lead notes, tasks, activities, notifications, or showing collections into its related-request summaries.

### Storefront agent slice

- Public web and native agent records resolve through `GET /api/v1/agents/:id`, scoped before selection to active agents in the active routing brokerage. Cross-storefront, inactive-agent, and unknown-host lookups fail closed.
- `/agents/:id` presents the active storefront agent, contact and brokerage context, preferred-agent action, and a separately paginated collection of active listings attributed to that agent.
- Agent-directory cards link to the exact record. Listing details link to the agent record only when the attributed agent also appears in the active storefront directory; external MLS attribution remains visible but non-interactive.
- Preferred-agent request routing and MLS listing attribution remain separately labeled throughout the record journey.
- Agent-to-listing links preserve the exact agent page as return context. Listing-to-agent links preserve the exact listing, including an earlier validated return path.
- The native app accepts exact cold-start and warm links for `/agents/:id`, keeps newer navigation ahead of stale profile loads, supports bounded incremental loading of attributed inventory, and preserves agent/listing returns in memory.

### Public discovery continuity slice

- Search list/map mode is canonical URL state. Filtered list cards plus real, fallback, and full-map markers carry the exact search URL into listing detail, so refresh and return restore both filters and presentation mode.
- Saved-home and village listing links carry their exact collection or record origin. Listing detail labels those returns explicitly instead of resetting consumers to an unfiltered search.
- Village detail resolves through `GET /api/v1/villages/:slug` and renders explicit loading, listing-loading, empty, error, and unavailable states. Unknown slugs no longer appear as a generic empty Guam village.
- Listing detail links reciprocally to its village while preserving the listing's own nested return path. Village listing cards likewise return to the exact village record.

### Staff intent context slice

- The intent queue's status, visitor identity, sort, and pagination are canonical URL state. Invalid or unknown values are removed, and changing an operational filter resets pagination.
- Free-text intent search remains in component memory and is removed from canonical and return URLs because it can contain names, email addresses, listing identifiers, or other private investigation text.
- Top and latest listing links carry the exact intent queue through the admin listing route. Listing detail retains its admin-view behavior, labels the origin as search intent, and returns to that queue instead of the lead inbox.
- Converted-lead links also preserve the intent origin, and query caches include the authenticated staff identity.

## Planned slices

1. Publish and verify the iOS universal-link contract for exact consumer records, then use canonical HTTPS record URLs in new notifications while retaining the existing `/open` handoff for previously issued links.
2. Add further bounded related-record summaries with separately pageable collections as volume grows.

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
