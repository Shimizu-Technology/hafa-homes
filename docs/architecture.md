# Architecture

## Overview

Hafa Homes will be built as a mobile-first PWA backed by a Rails API.

```txt
React/Vite PWA (/web)
  - mobile-first search UI
  - listing detail pages
  - map/list UX
  - lead capture
  - PWA installability
        |
        v
Rails API (/api)
  - listings/search
  - villages
  - leads
  - admin/sync concepts
  - MLS provider adapters later
        |
        v
PostgreSQL + PostGIS
  - listings
  - locations/geospatial queries
  - saved searches
  - leads
  - sync logs
        |
        v
Background Jobs
  - MLS sync
  - alerts
  - imports
  - stale listing checks
```

## Stack

| Layer | Technology | Reason |
| --- | --- | --- |
| Web | React + Vite + TypeScript | Fast PWA development and app-like UX |
| Styling | Tailwind CSS | Rapid custom design system |
| API | Rails API | Strong business logic, CRUD, jobs, integrations |
| Database | PostgreSQL | Reliable relational data store |
| Geo | PostGIS | Radius, map bounds, village/base proximity search |
| Auth | Clerk later | Shimizu default for user/admin auth |
| Jobs | GoodJob later | Postgres-backed jobs for sync/alerts |
| Maps | Mapbox likely | Polished mobile map experience |
| Email | Resend later | Transactional email and alerts |
| SMS | ClickSend later | Optional SMS alerts |
| Hosting | Netlify + Render + Neon | Shimizu default demo/client stack |

## API namespace

Use `/api/v1` for application endpoints.

Example endpoints:

```txt
GET    /api/v1/listings
GET    /api/v1/listings/:id
GET    /api/v1/villages
POST   /api/v1/leads
GET    /api/v1/data_sync_runs
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

Represents a user inquiry.

Fields:

- lead_type
- name
- email
- phone
- message
- listing_id optional
- preferred_contact_method
- status

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

Demo/prototype:

- `/web` deployed to Netlify
- `/api` deployed to Render
- Postgres hosted on Neon

Production later can stay on this stack or move to more dedicated infrastructure depending on traffic and MLS feed requirements.
