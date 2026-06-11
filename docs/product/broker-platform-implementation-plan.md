# Hafa Homes Broker Platform Implementation Plan

_Last updated: 2026-06-10 after PR #11 account deletion/App Store resubmission and admin/notification QA findings._

## Purpose

This document turns the broker-first / Real Geeks strategy into an implementation sequence.

Hafa Homes remains the polished demo/reference app, but the larger product is a shared platform that can power:

- Hafa Homes public discovery app.
- broker-branded websites.
- broker-branded mobile apps from the shared Expo codebase.
- broker/admin/agent lead CRM workflows.
- future rental/property-management tools.

## Current foundation completed

### PR #7 — Auth and consumer account foundation

Completed:

- Clerk auth across Rails API, React web, and Expo mobile.
- Rails `User` model.
- product roles: `platform_admin`, `brokerage_admin`, `agent`, `consumer`.
- protected admin/staff API access.
- server-backed saved listings.
- migration from legacy local mobile saves.
- signed-in lead submissions attach `user_id`.
- public/signed-out showing requests remain low-friction.
- Google and Apple sign-in in the mobile app.

### PR #8 — Broker Platform Foundation

Completed:

- `Brokerage`
- `Agent`
- `BrokerageMembership`
- `Listing.brokerage_id`
- `Listing.agent_id`
- `Lead.brokerage_id`
- `Lead.assigned_agent_id`
- lead status/quality/source foundation
- scoped broker/agent lead inbox/detail
- staff assignment/status updates
- seeded demo brokerage/agents
- role/tenant-scoped staff lead access

### PR #9 — Requests, Showing Scheduling, Admin Console, and Public Parity

Completed:

- `ShowingAppointment` model and staff API.
- Consumer `GET /api/v1/me/leads` request history.
- Web `/account/requests` and `/requests` alias.
- Mobile Requests tab.
- Web admin dashboard/sidebar shell.
- Web admin showings page.
- Web admin users/roles page.
- Stricter role scoping.
- Web/mobile listing detail parity.
- Safe notification foundation with Resend/ClickSend gates.
- Scheduled-showing notification queuing.
- Guam phone normalization.
- Atomic delivery-job claiming.

### PR #10 — CRM Expansion and Lead Quality Foundation

Completed:

- `LeadNote`
- `LeadTask`
- `LeadActivity`
- source/campaign tracking fields on leads
- CRM summary metrics
- edit/archive controls for notes and tasks
- paginated CRM history endpoints
- activity timeline with expandable change details
- responsive lead detail CRM workspace
- activity records for lead, note, task, showing, and notification events

See `docs/product/broker-crm-expansion-plan.md`.

## Recommended PR structure from here

Do **not** combine broker-branded websites, app build profiles, MLS integration, lead verification, property management, and deployment into one giant PR.

Recommended next sequence:

1. PR 4 — Consumer Profile/Settings + Form Parity.
2. PR 5 — Notification Link/Copy Polish.
3. PR 6 — Admin User Lifecycle.
4. PR 7 — Global Admin Audit Log.
5. PR 8 — Broker-Branded Website/App Foundation.
6. PR 9 — Lead Quality / CRM Automation Follow-up.
7. PR 10 — Property Management Preview.
8. PR 11 — Production Deployment + Demo Hardening.
9. PR 12 — MLS/Flexmls Adapter Skeleton once authorization path is clear.

See `docs/product/admin-ops-notification-hardening-plan.md` for PRs 4–7.

## PR 4 — Consumer Profile/Settings + Form Parity

Recommended branch:

```bash
feature/consumer-profile-settings
```

Goal:

> Make account/profile behavior feel complete and use signed-in profile data to reduce friction in showing/contact forms.

Scope:

- Dedicated mobile Profile & settings screen.
- Matching web `/account` settings page.
- Safe `PATCH /api/v1/me` profile update endpoint.
- User profile phone/preferred-contact fields.
- Signed-in lead form prefill from profile.
- Consumer/admin preferred-time parity, including `Flexible`.
- Account deletion remains in a danger zone.

## PR 5 — Notification Link/Copy Polish

Recommended branch:

```bash
feature/notification-link-polish
```

Goal:

> Make customer notification links and content production-grade.

Scope:

- Fix duplicate greeting in manual notification emails.
- Centralize notification CTA link generation.
- Use HTTPS universal/app links for app-first behavior with web fallback.
- Add mobile deep-link handling for request history and listing detail.

## PR 6 — Admin User Lifecycle

Recommended branch:

```bash
feature/admin-user-lifecycle
```

Goal:

> Let platform admins create, invite, edit, archive, and reactivate staff/consumer users from the admin dashboard.

Scope:

- `POST /api/v1/admin/users`.
- Clerk-backed invitation or pending-user acceptance flow.
- Create admins, agents, brokerage admins, and consumers.
- Edit roles/memberships/linked agent profiles.
- Archive/reactivate/revoke lifecycle.
- Resend invite action if Clerk invitations are used.

## PR 7 — Global Admin Audit Log

Recommended branch:

```bash
feature/admin-audit-log
```

Goal:

> Give platform/brokerage admins trustworthy history across users, leads, showings, notifications, and account actions.

Scope:

- `AuditEvent` model/table.
- `AuditLogger.record!` service.
- `GET /api/v1/admin/audit_events` with filters.
- Admin audit UI page.
- Tenant-scoped visibility for brokerage users.

## PR 8 — Domain-First Broker-Branded Website/App Foundation

Recommended branch:

```bash
feature/broker-branded-sites-apps
```

Goal:

> Show that the same Hafa Homes platform can power a brokerage’s own branded website/app experience.

Scope:

- `BrokerageDomain` model for broker-owned domains.
- host-based tenant resolver with slug preview fallback.
- brokerage branding config.
- brokerage logo/color/app display name fields.
- brokerage public homepage/profile on owned domains.
- brokerage-scoped listing/search page.
- agent roster/profile pages.
- lead forms routed to brokerage by resolved tenant.
- compliance/disclaimer placeholder blocks.
- “Powered by Hafa Homes” footer option.
- shared Expo/EAS app branding configuration plan.

See `docs/product/broker-branded-layer-plan.md`.

### Out of scope for PR 8

- real MLS/Flexmls integration.
- production DNS automation for many broker domains.
- live broker-specific app-store submissions.
- subscription billing.
- full CMS/page builder.
- full property-management module.

## PR 9 — Lead Quality / CRM Automation Follow-up

Recommended branch:

```bash
feature/lead-quality-crm-automation
```

Goal:

> Improve broker confidence that leads are reachable, deduped, and followed up quickly.

Scope:

- duplicate lead detection.
- phone/email verification indicators.
- saved-search/listing activity scoring.
- speed-to-lead reminders.
- notification preferences.
- CSV export.
- agent follow-up reporting.
- delivery webhook/receipt sync for Resend and ClickSend if needed.

## PR 10 — Property Management Preview

Recommended branch:

```bash
feature/property-management-preview
```

Goal:

> Add a demoable premium-tier surface for Guam’s rental/property-management reality without building a full management suite yet.

Scope:

- managed properties list.
- tenant list.
- lease/date placeholders.
- rent status placeholder.
- maintenance request preview.
- owner/tenant portal concept.
- property-management CTA from broker-branded pages.

## PR 11 — Production Deployment + Demo Hardening

Recommended branch:

```bash
feature/production-demo-hardening
```

Goal:

> Make the current broker demo safe to show from production URLs/devices.

Scope:

- deploy latest API.
- run production migrations.
- verify background jobs.
- deploy latest web.
- refresh TestFlight/mobile config if needed.
- verify notifications remain gated unless intentionally enabled.
- prepare demo accounts and seed/demo data.
- update App Store/TestFlight notes.

## PR 12 — MLS/Flexmls Adapter Skeleton

Only start after broker/Flexmls/GAR discovery clarifies the authorized path.

Goal:

> Prepare a provider adapter without claiming unauthorized MLS access.

Possible scope:

- source/feed models.
- provider adapter interface.
- normalized listing payload.
- sync run logging.
- attribution/disclaimer fields.
- dry-run importer using sample/exported authorized data.

## Parallel discovery track

Mike/John/Leon should keep gathering broker and MLS context while product work continues.

### Carl / MLS committee

Ask:

- How Real Geeks connects to Flexmls/MLS in Guam.
- What vendor/app approval Hafa Homes needs.
- What attribution/disclaimer/photo rules apply.
- Whether one broker can authorize us or multiple brokers must each authorize us.

### Clare Delgado / Home Ventures

Ask:

- What Real Geeks does well or poorly.
- Whether agents actually use the CRM.
- How leads are routed/followed up today.
- Whether website takeover would be attractive.
- What property-management/rental workflows matter most.

### Bawar / GAR president

Ask:

- How GAR views a local Guam-built platform.
- What rules or political concerns should be handled early.
- Which brokers should be interviewed next.

## Build principles

- Public browsing stays unauthenticated.
- Saved homes require login and are server-backed.
- Showing requests remain public for low-friction lead capture.
- Signed-in showing requests attach `user_id` server-side.
- Broker/admin/agent access is role- and tenant-scoped.
- Do not create a separate full codebase per broker.
- Broker-owned domains are the primary public UX; slugs are preview/dev fallback only.
- Use one shared backend and shared frontend/mobile codebases with tenant/domain/branding config.
- Web admin is the primary serious admin/CRM surface.
- Mobile admin should stay lightweight until CRM workflows are proven.
- Use `Listing ID`, not `MLS ID`, until MLS authorization exists.
- External email/SMS sends must be gated by env flags.

## Success criteria for the next broker-branded PR

PR 4 is successful when:

- `BrokerageDomain` or equivalent host-based tenant mapping exists;
- a branded brokerage public page exists and is domain-ready;
- a brokerage-scoped listing/search page exists;
- basic agent roster/profile pages exist;
- leads from broker-branded pages route to the correct brokerage;
- existing public Hafa Homes browsing still works;
- existing staff/admin CRM scoping still works;
- docs explain domain-first shared-codebase broker branding architecture;
- API smoke, web build, and mobile checks pass.
