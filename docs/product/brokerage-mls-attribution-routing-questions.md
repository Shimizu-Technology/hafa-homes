# Brokerage Apps, MLS Attribution, and Lead Routing Questions

_Last updated: 2026-06-18 after Mike/John follow-up._

## Why this needs a decision

The agent-selection PR adds the V1 workflow Mike asked for: a customer can choose an agent from the brokerage and leads can be routed/filtered by that agent in the admin CRM.

Mike/John clarified that MLS/FlexMLS should expose the broader Guam inventory, not only one brokerage's own listings. That means broker-branded Hafa Homes experiences should preserve MLS listing attribution while routing interested customers to the app/brokerage agent they choose.

Confirmed direction:

> Show authorized Guam MLS/FlexMLS listings broadly, keep the true listing agent/office attribution visible, and route customer conversations to the selected buyer-side/preferred agent from the app brokerage.

## Concepts to keep separate

### 1. Listing attribution

Who officially represents the listing/property.

In the app today:

```text
Listing.agent
Listing.brokerage
```

For real MLS/FlexMLS listings, this should normally come from the MLS feed and should not be casually overwritten by admins. It is attribution/compliance data.

Example:

```text
Listed by: Jane Realtor
Office: ABC Realty
```

### 2. Customer-selected / preferred agent

Who the customer wants to work with.

In the app today:

```text
Lead.requested_agent
```

This is consumer intent / buyer-side relationship preference, not MLS attribution.

Example:

```text
Customer wants Daniel Cruz to help them see the property.
```

### 3. Assigned lead agent / CRM owner

Who owns follow-up in the brokerage CRM.

In the app today:

```text
Lead.assigned_agent
```

This can be set initially from the requested agent, then reassigned by admins without changing listing attribution or the original customer preference.

Example:

```text
Requested agent: Daniel Cruz
Assigned CRM owner: Mia Santos
```

## Current V1 behavior in this PR

The V1 implementation now aligns with the full-market direction while using a simple default routing brokerage until domain/app tenant resolution exists:

- Agent directory shows active agents from the current routing/app brokerage.
- Customer can select a preferred agent from that routing brokerage.
- Showing/price leads include `requested_agent_id` only when explicitly selected.
- Backend validates requested agent against `Lead.brokerage` / routing brokerage before setting routing.
- `Listing.agent` and `Listing.brokerage` remain listing/MLS attribution and are not overwritten.
- `Lead.brokerage` is the brokerage/app that owns the lead conversation.
- No-preference leads stay in the brokerage queue instead of auto-assigning to the listing agent.
- UI copy distinguishes `Listed by` from `Preferred agent` / `Work with an agent`.

This handles Mike's immediate lead-generation feedback while avoiding the incorrect assumption that the requested agent must belong to the listing brokerage.

## Real-world brokerage / MLS models to confirm

### Option A — Brokerage-only inventory

Each broker-branded app shows only that brokerage's own listings.

Implications:

- `Listing.brokerage` and app/routing brokerage are usually the same.
- Customer-selected agent belongs to the same brokerage as the listing.
- Current V1 backend validation model maps closely to this.
- Simpler compliance and routing model.

### Option B — Full-market IDX/FlexMLS search — confirmed direction

Each broker-branded app shows all authorized Guam MLS/FlexMLS listings, including listings from other brokerages.

Implications:

- `Listing.brokerage` = MLS/listing brokerage.
- App/routing brokerage = brokerage that owns the branded app/customer relationship.
- Customer-selected agent may belong to the app brokerage, not the listing brokerage.
- Lead routing should go to the selected app brokerage agent, while listing attribution remains the actual MLS listing agent/office.
- We likely need a stronger tenant/app-brokerage resolver before loosening the current validation rule.

Current/future model:

```text
Listing.agent              = MLS/listing attribution
Listing.brokerage          = MLS/listing office/brokerage
Lead.requested_agent       = selected buyer-side/preferred agent
Lead.assigned_agent        = CRM owner
Lead.brokerage             = routing/app brokerage that owns the lead
```

## Admin assignment questions

There are two different assignment workflows:

### A. Assigning a listing to an agent

Question:

> Should brokers/admins assign properties/listings to agents in Hafa Homes?

Likely answer depends on listing source:

- MLS/FlexMLS listings: listing agent/office should come from MLS and be treated as source-of-truth attribution.
- Manual/off-market/property-management/demo listings: broker/admin may need to assign the listing to an internal agent.

Potential future field if needed:

```text
Listing.internal_owner_agent_id
```

But do not add this unless Mike/John confirm agents need internal listing-inventory ownership separate from MLS attribution.

### B. Assigning a lead to an agent

This already exists and is the CRM workflow:

```text
Lead.assigned_agent
```

Admins can assign/reassign the lead owner without changing:

- the MLS/listing agent;
- the listing brokerage;
- the original requested agent.

## Questions for Mike / John / brokerage

### Inventory scope

1. For a broker-branded app, should it show only that brokerage's own listings?
2. Or should it show all authorized Guam MLS/FlexMLS listings, like an IDX/full-market search?
3. If all listings are shown, should there be an `Our listings` filter or featured section?
4. Is the main value proposition showcasing a brokerage's inventory, or generating buyer/renter leads for that brokerage's agents across the full market?

### Lead routing

5. If a customer selects an agent from Brokerage A but inquires about a listing from Brokerage B, should Brokerage A's selected agent receive the lead and coordinate with the listing brokerage?
6. Should the selected/preferred agent behave like a buyer's agent/customer contact?
7. If the customer chooses no preference, should the lead go to the listing agent, brokerage admin, round-robin, or unassigned queue?
8. Should a customer's global preferred agent follow them across all listings, or should each request default to no preference unless they choose again?

### Listing attribution / MLS compliance

9. When FlexMLS is connected, what exact attribution must we show: listing agent, listing office, MLS number, source, disclaimer, update timestamp?
10. Are there restrictions on showing other brokerages' listings inside a broker-branded app?
11. Are there required rules around contact forms, showing requests, or routing leads when the listing is from another brokerage?
12. Should admins ever be allowed to edit MLS-provided listing agent/office attribution, or should it be read-only?

### Admin workflows

13. Do brokers/admins need a listing-management screen to manually assign internal/off-market listings to agents?
14. Or should admin assignment focus only on leads/CRM ownership?
15. Should admins see both `Requested agent` and `Assigned agent` on every lead?
16. Should agent dashboards show leads assigned to them, listings attributed to them, or both as separate tabs?

### Product / go-to-market

17. Is Hafa Homes the consumer marketplace app, while broker-branded apps are tenant-specific experiences?
18. Would brokerages expect their own app to include all Guam listings because consumers expect full search?
19. Would brokerages be comfortable with their agents receiving leads for listings represented by other brokerages?
20. Should we position this like: “Search all Guam listings, work with your chosen [Brokerage] agent”?

## Recommendation before qualified-lead capture

The routing foundation should be in place before building qualification prompts/scoring:

1. Treat `Lead.brokerage` as the app/routing brokerage that owns the customer relationship.
2. Treat `Listing.brokerage` and `Listing.agent` as MLS/listing attribution.
3. Validate `Lead.requested_agent` against the routing brokerage, not the listing brokerage.
4. Do not auto-assign no-preference leads to the listing agent.
5. Keep lead qualification answers attached to the lead/customer profile owned by the routing brokerage.

Next implementation after this PR should be qualified lead capture: lightweight prompts for prequalification, lender/bank, timeline, budget, villages, beds/baths, and quality summary for agents/admins.
