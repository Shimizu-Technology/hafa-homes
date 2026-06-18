# Agent Selection + Lead Routing

## What shipped in this branch

- Public `/api/v1/agents` endpoint for active brokerage agents.
- Consumer-selected `requested_agent_id` on lead creation.
- Rails validation that public requests can only route to an active agent in the listing brokerage context.
- `Lead.requested_agent` is stored separately from `Lead.assigned_agent`.
- Initial routing sets `assigned_agent` to the requested agent so CRM ownership works immediately.
- Admin lead list can filter by assigned agent or unassigned leads.
- Admin lead cards/detail show requested agent versus assigned agent.
- Web Agents page lets consumers choose a preferred agent and stores it locally.
- Web and mobile showing/price requests include the preferred agent when valid.
- Mobile Agents tab lets consumers select/clear a preferred agent.
- Demo seed data now includes four distinct active agents.

## Data model rule

Keep these concepts separate:

1. `Listing.agent` — listing/MLS attribution.
2. `Lead.requested_agent` — the customer-selected/preferred agent.
3. `Lead.assigned_agent` — the CRM owner responsible for follow-up.

For V1, when a public consumer chooses an agent, the backend also sets `assigned_agent` to that same agent after validating that the agent belongs to the listing brokerage. Admins can later reassign the CRM owner without rewriting the original customer request.

## Open questions for Mike / John / brokerage

1. Should the customer-selected agent be global across the app, per listing request, or both?
2. Can a customer choose any agent in the brokerage for any listing, or should some listings force the listing agent/team?
3. Do we need an explicit “No preference / brokerage team” option in the consumer UI, or should the first/listing agent be preselected?
4. Should the requested agent remain visible if an admin reassigns the CRM owner to someone else?
5. Should agents receive automatic notifications for routed leads, and should brokerage admins be copied?
6. What exact lead-routing fallback should happen if the selected agent is inactive/on vacation: unassigned, listing agent, round-robin, or brokerage admin?
7. Do agents need public profile pages and shareable URLs, or is the directory enough for V1?
8. Should the admin filter include “assigned to me” as a one-click shortcut once real agent users are mapped to `Agent` records?
9. Should listing search support “show only listings represented by this agent,” or should agent selection only affect inquiry routing?
10. What compliance wording should appear around demo/MLS attribution when real MLS data is connected?
11. Should brokerages be able to control agent ordering/featured agents?
12. What profile fields should each agent own: headshot, bio, languages, specialties, villages served, license number, contact preferences?

## Follow-ups

- Add backend request specs once a Rails test framework is in place.
- Add admin “assigned to me” filter after staff users are explicitly linked to agent profiles.
- Add agent availability/out-of-office rules before enabling live notifications.
- Add broker-controlled public agent profiles as part of the broker-domain foundation.
