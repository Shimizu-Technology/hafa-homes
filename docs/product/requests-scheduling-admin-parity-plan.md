# Requests, Showings, Admin, and Public Parity Plan

_Last updated: 2026-06-09._

## Purpose

This plan extends the broker platform foundation beyond lead capture into the end-to-end workflow Leon flagged during local PR #8 testing:

1. consumer request history,
2. real showing scheduling,
3. proper web admin dashboard,
4. user/role management,
5. stricter role-scoped access,
6. public web/mobile feature parity.

## Implemented in `feature/requests-scheduling-admin-parity`

### Consumer request history

Signed-in consumers can now see their own requests through:

- API: `GET /api/v1/me/leads`
- Web: `/account/requests`
- Mobile: `More → My requests`

Consumer request payloads use consumer-safe status labels and include listing context, assigned agent/brokerage, and appointment details when available. Internal CRM notes are not exposed to consumers.

### Real showing scheduling

Added `ShowingAppointment` as a first-class scheduling record connected to lead/listing/brokerage/agent.

Fields include:

- `scheduled_starts_at`
- `scheduled_ends_at`
- `timezone`
- `tour_type`
- `status`
- `location`
- `consumer_notes`
- `internal_notes`

Staff endpoints:

- `GET /api/v1/showing_appointments`
- `GET /api/v1/showing_appointments/:id`
- `POST /api/v1/showing_appointments`
- `PATCH /api/v1/showing_appointments/:id`

Confirmed/proposed dated showings advance the lead to `showing_scheduled`.

### Web admin console

The admin surface now has an admin-specific shell/sidebar instead of relying on public navigation.

Routes:

- `/admin` dashboard
- `/admin/leads`
- `/admin/leads/:id`
- `/admin/showings`
- `/admin/users`
- `/admin/sync`

Dashboard metrics include open leads, new leads, unassigned leads, upcoming showings, and stale follow-ups.

### User and role management

Platform admins can now manage users at `/admin/users`.

Supported actions:

- update product role: `platform_admin`, `brokerage_admin`, `agent`, `consumer`
- attach brokerage membership
- update membership role/status
- link a user to an agent profile

API:

- `GET /api/v1/admin/users`
- `PATCH /api/v1/admin/users/:id`
- `GET /api/v1/admin/brokerages`
- `GET /api/v1/admin/agents`

### Stricter role scoping

Lead/showing access now follows stricter defaults:

- platform admins see all leads/showings.
- brokerage admins see leads/showings for brokerages where they have active `brokerage_admin` membership.
- agents see leads/showings assigned to their linked agent profile.

This moves away from giving every agent broad brokerage-level lead visibility by default.

### Public web/mobile feature parity

Listing detail now aligns more closely across web and mobile:

- multiple photos on mobile
- Local Intel on web
- mortgage calculator on web
- price alerts on mobile
- server-backed saved homes on web
- safer `Listing ID` language instead of demo `MLS ID`
- consistent “Request a showing” terminology
- visible listing facts/source context

## Still future / follow-up

- email/SMS notifications for scheduled showings
- admin lead notes/tasks/activity timeline
- invite/resend invite flows through Clerk
- duplicate lead detection and lead quality scoring
- calendar integration
- lightweight mobile staff mode for agents
- broker-specific branded admin/site/app configuration
