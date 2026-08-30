# Requests, Showings, Admin, and Public Parity Plan

_Last updated: 2026-06-10._

## Purpose

This plan extends the broker platform foundation beyond lead capture into the end-to-end workflow Leon flagged during local PR #8 testing:

1. consumer request history,
2. real showing scheduling,
3. proper web admin dashboard,
4. user/role management,
5. stricter role-scoped access,
6. public web/mobile feature parity.

## Implemented in PR #9 (`feature/requests-scheduling-admin-parity`)

### Consumer request history

Signed-in consumers can now see their own requests through:

- API: `GET /api/v1/me/leads`
- Web: `/account/requests` with `/requests` as a friendly alias
- Mobile: dedicated bottom-tab `Requests` screen

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

Confirmed/proposed dated showings advance the lead to `showing_scheduled`. Showing agent assignment persists back to the lead even when an appointment is still proposed without a final scheduled time. If the only active scheduled showing is later cancelled or marked no-show, the lead returns to `contacted` so consumer request history does not keep showing stale “Showing scheduled” status.

### Notifications

Added a safe notification foundation for request and showing workflows:

- `NotificationDelivery` stores email/SMS delivery attempts for leads/showings.
- Resend is the email provider.
- ClickSend is the SMS provider.
- Automatic request/showing notifications are queued, but external sending is gated by `EMAIL_NOTIFICATIONS_ENABLED` and `LIVE_SMS_ENABLED`.
- Scheduling or updating a showing queues customer email and customer SMS when those contact methods exist, plus agent email when an assigned agent has an email.
- Admins can compose and queue customer email, customer text, and agent email from lead detail, including custom email subject/heading/body or SMS body.
- Lead detail shows recent delivery status/history and custom message previews.
- Skipped local/dev sends are labeled as “not sent” with clearer configuration messages instead of looking like provider failures.
- Phone inputs default toward Guam `+1671` formatting; Rails normalizes Guam phone numbers before SMS delivery, including legacy/raw local numbers already on leads.
- Initial request-received notifications only queue for consumer-initiated API lead creation; staff/scripted lead creation stays quiet unless explicitly opted in.
- Notification jobs atomically claim queued deliveries before provider calls to avoid duplicate live email/SMS sends if jobs overlap or retry.
- Lead/showing records and their notification intents are persisted atomically. A queue outage after commit leaves visible `queued` deliveries for the recurring reconciler instead of losing the send or returning a false request failure.
- Web and native lead forms reuse a brokerage-scoped UUID idempotency key until the API succeeds. Same-payload retries return the original lead; key reuse with changed content is rejected, preventing duplicate requests and notifications after timeouts.

This follows the starter-app Resend/ClickSend pattern: important sends should be visible and resendable from the dashboard, while live SMS/email remains opt-in via environment config.

### Web admin console

The admin surface now has an admin-specific collapsible shell/sidebar instead of relying on public navigation.

Routes:

- `/admin` dashboard
- `/admin/leads`
- `/admin/leads/:id`
- `/admin/showings`
- `/admin/users`
- `/admin/sync`

Dashboard metrics include open leads, new leads, unassigned leads, upcoming showings, and stale follow-ups.

Lead detail lets staff edit customer/request fields after a call, including name, email, phone, preferred contact method, request type, tour type, preferred date/time, target price, and message. Admin layouts are tuned for both desktop and mobile web, including compact mobile dashboard metrics, cleaner user filter chips, the lead detail editor, notification panel, routing panel, lists, and user-management forms. Notification history shows the latest sends first and can expand older rows on demand instead of flooding the mobile page.

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

- Resend webhook status updates and ClickSend delivery receipt sync
- admin lead notes/tasks/activity timeline
- invite/resend invite flows through Clerk
- duplicate lead detection and lead quality scoring
- calendar integration
- lightweight mobile staff mode for agents
- broker-specific branded admin/site/app configuration
