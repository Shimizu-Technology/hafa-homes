# Broker CRM Expansion Plan

_Last updated: 2026-06-10._

## Purpose

This phase deepens the broker/admin CRM after the broker platform and request/showing foundations. The goal is to make Hafa Homes feel like a real lead-follow-up workspace for brokers and agents, not only a lead list.

## Implemented in `feature/broker-crm-expansion`

### CRM records

Added first-class CRM primitives:

- `LeadNote` for internal staff notes.
- `LeadTask` for follow-up reminders and completion tracking.
- `LeadActivity` for lead timeline events.

Lead records also now support lightweight source context:

- `source_campaign`
- `source_url`

### Lead timeline

Lead activity is recorded for important CRM events:

- lead created
- lead updated
- note added
- task created
- task completed/reopened
- showing appointment created/updated
- notification queued/sent/failed/skipped

This gives broker admins and agents a chronological audit trail of what happened with a lead without exposing internal activity to consumers.

### Staff API

Added scoped staff endpoints:

- `POST /api/v1/leads/:lead_id/notes`
- `POST /api/v1/leads/:lead_id/tasks`
- `PATCH /api/v1/lead_tasks/:id`

All endpoints use existing `StaffLeadScoping`, so platform admins, brokerage admins, and agents only operate on leads/tasks they are allowed to access.

### Admin web UX

Lead detail now includes a responsive CRM workspace with:

- CRM summary cards for open tasks, overdue tasks, and notes.
- next follow-up panel.
- add follow-up task form.
- add internal note form.
- open task list with done/reopen actions.
- recent completed tasks.
- recent internal notes.
- activity timeline.
- quality/source fields in the lead details editor.

The layout is tuned for both desktop and mobile admin use.

## Still future / follow-up

- Richer duplicate lead detection.
- Verified email/phone badge workflow.
- Saved-search/listing activity scoring.
- Calendar integration.
- CRM search/filtering by task due date, overdue status, and lead quality.
- CSV export.
- Automated speed-to-lead reminders.
- Agent performance reporting.
