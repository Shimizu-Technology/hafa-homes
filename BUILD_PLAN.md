# Hafa Homes Build Plan

## Status

Current phase: **Frontend MVP build-out**

## Repo Structure

```txt
hafa-homes/
  api/      # Rails API
  web/      # React/Vite PWA
  docs/     # Product and architecture docs
```

## Phase 1: Planning and architecture

- [x] Create repo
- [x] Document product brief
- [x] Document MVP scope
- [x] Document Locations LLC research
- [x] Document Guam market research
- [x] Choose name: Hafa Homes
- [x] Decide PWA-first approach
- [x] Create PRD
- [x] Create build plan
- [x] Create architecture doc

## Phase 2: Scaffold app foundation

- [x] Create Rails API in `/api`
- [x] Create React/Vite app in `/web`
- [x] Configure TypeScript/Tailwind frontend
- [x] Configure API CORS
- [x] Configure Postgres/PostGIS-ready backend
- [x] Add shared environment examples
- [x] Verify both apps build/boot locally

## Phase 3: Backend MVP

- [x] Add core models
  - [x] Listing
  - [x] ListingPhoto
  - [x] Village
  - [x] Feature
  - [x] ListingFeature
  - [x] Lead
  - [x] SavedSearch
  - [x] SavedListing
  - [x] DataSyncRun
- [x] Add demo seed data
- [x] Add API controllers
  - [x] `/api/v1/listings`
  - [x] `/api/v1/listings/:id`
  - [x] `/api/v1/villages`
  - [x] `/api/v1/leads`
  - [x] `/api/v1/data_sync_runs`
- [x] Add listing filters
- [ ] Add basic request specs or smoke tests

## Phase 4: Frontend MVP

- [x] Build app shell
- [x] Add routing
- [x] Add API client
- [x] Add home/search page
- [x] Add search results page
- [x] Add listing detail page
- [x] Add filter drawer
- [x] Add village pages
- [x] Add military relocation page
- [x] Add saved listings/searches concept page
- [x] Add lead capture modal/form
- [x] Add admin MLS sync concept screen

## Phase 5: Maps and PWA polish

- [ ] Add PWA manifest and icons
- [ ] Add mobile safe-area support
- [ ] Add Mapbox integration
- [ ] Show listing pins
- [ ] Add map/list toggle
- [ ] Add loading/empty/error states

## Phase 6: Deploy demo

- [ ] Deploy API to Render
- [ ] Deploy Postgres to Neon
- [ ] Deploy web to Netlify
- [ ] Configure environment variables
- [ ] Send demo URL to Mike

## Phase 7: Real MLS discovery

- [ ] Confirm MLS/IDX/API access path
- [ ] Confirm feed format
- [ ] Confirm refresh rules
- [ ] Confirm data display compliance
- [ ] Implement real provider adapter
- [ ] Replace demo seed flow with authorized sync
