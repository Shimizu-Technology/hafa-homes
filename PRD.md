# Hafa Homes PRD

> Historical planning snapshot: this document describes the original PWA-first MVP. The shipped product now includes a Rails API, React web/PWA and admin CRM, and a dedicated Expo mobile app. Use `docs/product/current-product-truth.md` for current scope and status.

## Executive Summary

Hafa Homes is a Guam-first housing platform inspired by the Hawaii-focused Locations LLC app. The first milestone is a polished mobile-first PWA demo backed by a real Rails API foundation and seed data, so Mike and the potential investor can evaluate the product before MLS access is finalized.

## Guiding Principles

### 1. Guam-first, not generic
Every product decision should reflect how people actually search for housing on Guam: village, base commute, rentals, pets, typhoon readiness, furnished units, and local support.

### 2. PWA first, native later
Build a mobile-first web app that feels installable and app-like. Package as iOS/Android later only after demo validation and data access clarity.

### 3. Real foundation, demo data
The MVP should use seed/sample data initially, but the backend should be structured for authorized MLS/IDX/API integration later.

### 4. Local trust and lead capture
The product should make it easy for users to request help, schedule showings, save searches, and connect with a local agent/property manager.

## Users

| Role | Description |
| --- | --- |
| Visitor | Browses listings, villages, relocation content, and submits inquiries |
| Registered User | Saves listings/searches and manages alerts in a later phase |
| Agent | Receives/responds to leads in a later phase |
| Admin | Manages listings, seed/import data, sync status, and leads |
| Property Manager | Manages rental listings in a later phase |

## MVP Features

### Public/PWA

- Home/search page with Buy/Rent tabs
- Listing search and filters
- Listing results cards
- Listing detail pages
- Village pages
- Military relocation page
- Saved listings/searches concept UI
- Request showing / ask about property lead form
- PWA manifest and app-like mobile shell

### API

- Listings endpoint with filters
- Listing detail endpoint
- Villages endpoint
- Lead creation endpoint
- Seed demo data
- MLS sync run model/concept endpoint

### Admin concept

The first demo may include a lightweight admin/sync status screen to show how MLS updates will be monitored.

## Core Filters

- Sale/rent
- Village
- Property type
- Price range
- Beds/baths
- Pet friendly
- Furnished
- Ocean view
- Near Andersen AFB
- Near Naval Base Guam
- Near Camp Blaz
- Generator
- Water tank
- Typhoon shutters
- Split AC
- Fenced yard

## Out of Scope for First Demo

- Real MLS integration
- Native iOS/Android submission
- Full authentication and user management
- Payment processing
- Full CRM/property management
- Tenant screening/rental applications
- Production SMS/email alerts

## Success Criteria

The MVP/demo is successful if Mike and the investor agree that:

1. Hafa Homes clearly feels like a Guam version of Locations LLC.
2. The app is more polished and local than current Guam IDX sites.
3. The technical path for MLS syncing is credible.
4. The product is worth funding or moving into a real-data implementation phase.
