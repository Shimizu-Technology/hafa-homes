# Architecture

## Overview

Hafa Homes is built as a Rails API with shared public web/PWA, web admin CRM, and Expo mobile surfaces. The product started as a mobile-first PWA demo and is now evolving into a broker-first platform that can power Hafa Homes plus broker-branded websites/apps from shared codebases.

```txt
React/Vite Web (/web)
  - public Hafa Homes web/PWA
  - future domain-first broker-branded public pages
  - admin dashboard + CRM
  - listing/search/detail
  - lead capture and request history
        |
        v
Expo Mobile (/mobile)
  - consumer app experience
  - saved homes
  - request history
  - future broker-branded app config/build profiles
        |
        v
Rails API (/api)
  - listings/search
  - villages/local intel
  - Clerk auth integration
  - saved listings/searches
  - brokerages/agents/memberships
  - leads/showing appointments
  - notes/tasks/activity timeline
  - notification delivery logs
  - MLS provider adapters later
        |
        v
PostgreSQL
  - listings/villages/features
  - users/saved listings
  - brokerages/agents/memberships
  - leads/showings/CRM records
  - notification deliveries
  - sync logs
        |
        v
Background Jobs
  - notifications
  - MLS sync later
  - alerts later
  - imports later
  - stale listing checks later
```

## Stack

| Layer | Technology | Reason |
| --- | --- | --- |
| Web | React + Vite + TypeScript | Fast PWA development and app-like UX |
| Styling | Tailwind CSS | Rapid custom design system |
| API | Rails API | Strong business logic, CRUD, jobs, integrations |
| Database | PostgreSQL | Reliable relational data store |
| Geo | PostGIS | Radius, map bounds, village/base proximity search |
| Auth | Clerk | Shimizu default for user/admin auth; Rails owns authorization |
| Jobs | Rails jobs / production worker TBD | Notifications now; sync/alerts later |
| Maps | Mapbox | Polished mobile/web map experience |
| Email | Resend | Transactional email behind explicit env gates |
| SMS | ClickSend | Optional SMS behind explicit env gates |
| Hosting | Netlify + Render + Neon | Shimizu default demo/client stack |

## API namespace

Use `/api/v1` for application endpoints.

Example endpoints:

```txt
GET    /api/v1/listings
GET    /api/v1/listings/:id
GET    /api/v1/villages
POST   /api/v1/leads
GET    /api/v1/leads
GET    /api/v1/leads/:id
PATCH  /api/v1/leads/:id
GET    /api/v1/me/leads
GET    /api/v1/showing_appointments
POST   /api/v1/showing_appointments
PATCH  /api/v1/showing_appointments/:id
GET    /api/v1/leads/:lead_id/notes
POST   /api/v1/leads/:lead_id/notes
PATCH  /api/v1/lead_notes/:id
GET    /api/v1/leads/:lead_id/tasks
POST   /api/v1/leads/:lead_id/tasks
PATCH  /api/v1/lead_tasks/:id
GET    /api/v1/leads/:lead_id/activities
GET    /api/v1/admin/dashboard
GET    /api/v1/admin/users
```

## Data model draft

### Listing

Represents one property for sale or rent.

Important fields:

- external_id
- source
- status
- listing_kind: sale/rent
- property_type
- price
- address
- village_id
- latitude/longitude
- beds
- baths
- square_feet
- lot_square_feet
- year_built
- description
- agent/brokerage attribution
- published_at
- source_updated_at

### Village

Represents a Guam village/region.

Fields:

- name
- slug
- region
- description
- latitude/longitude

### Feature

Searchable local feature tag.

Examples:

- Pet friendly
- Furnished
- Ocean view
- Generator
- Water tank
- Typhoon shutters
- Split AC
- Fenced yard
- Near Andersen AFB

### Lead

Represents a user inquiry or showing/contact request.

Fields/concepts:

- lead_type
- name/email/phone
- message and preferences
- listing_id optional
- user_id optional when signed in
- brokerage_id
- assigned_agent_id
- status
- quality_status
- source/campaign fields
- last_contacted_at

### Broker CRM records

- `LeadNote`: internal staff notes with edit/archive.
- `LeadTask`: follow-up reminders/tasks with completion/reopen/archive.
- `LeadActivity`: chronological timeline of lead, note, task, showing, and notification events.
- `ShowingAppointment`: staff-managed showing schedule/status.
- `NotificationDelivery`: email/SMS delivery log with gated provider sends.

### Brokerage / Agent tenancy

- `Brokerage`: broker/customer/office tenant.
- `BrokerageDomain`: maps broker-owned domains/subdomains to a brokerage tenant.
- `Agent`: agent/realtor profile tied to brokerage.
- `BrokerageMembership`: user-to-brokerage role membership.

### DataSyncRun

Tracks future MLS/import sync activity.

Fields:

- provider
- status
- started_at
- finished_at
- imported_count
- updated_count
- inactive_count
- error_count
- notes

## MLS integration approach

Do not bind the app to one feed format too early. Use provider adapters.

```txt
Provider Adapter
  -> Normalized Listing Payload
  -> Listing Upsert Service
  -> Change Detector
  -> Alerts/Admin Logs
```

Possible adapters:

- RESO Web API
- RETS
- IDX provider API
- CSV/XML import
- Manual admin entry

## Deployment target

Current/default stack:

- `/web` on Netlify
- `/api` on Render
- Postgres on managed Postgres/Neon-style infrastructure
- Expo/EAS for mobile builds

Production can stay on this stack initially, but latest migrations/features must be deployed and verified before relying on CRM/scheduling/notifications in a live broker demo.

## White-label / broker-branded architecture

Default recommendation:

- one shared Rails API;
- one shared React web/admin codebase;
- one shared Expo mobile codebase;
- broker-owned domains are the primary web product;
- slug routes are preview/dev fallback only;
- brokerage domain/tenant/branding config controls public customer-facing surfaces.

Avoid one full Rails/web/mobile stack per broker unless a future enterprise customer pays for dedicated infrastructure.
