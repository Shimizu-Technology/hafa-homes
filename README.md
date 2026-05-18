# Hafa Homes

**Hafa Homes** is a proposed Guam-first housing and real estate platform inspired by the Hawaii-focused Locations LLC app.

The goal is to build a polished, mobile-first experience for finding homes, rentals, neighborhoods, and real estate guidance on Guam — with local filters and workflows that national housing apps do not handle well.

## Working tagline

> Find your home on Guam.

## Project status

This repository contains the MVP/demo foundation:

- `/api` — Rails API with Postgres-backed seed data and initial listing/search endpoints
- `/web` — React/Vite/TypeScript PWA shell with Tailwind and app-like mobile UI
- `/docs` — product, research, MLS, and architecture documentation

The first implementation target is a mobile-first PWA that can later be packaged as iOS/Android if needed.

## Why this exists

A Bank of Hawaii executive on Guam, who uses the Locations LLC app for Hawaii real estate, asked whether a Guam version could be built. There is also potential investor/client interest in a Guam-specific version. The key product question is not whether the app can be built — it can — but whether we can secure authorized MLS/IDX/API access and build a differentiated Guam-first experience.

## Core thesis

Do not build a generic “Zillow for Guam.” Build a Guam-specific housing platform around how people actually search for property on island:

- Military relocation and PCS needs
- Rentals and property management
- Village/neighborhood lifestyle
- Base commute and proximity
- Pet-friendly housing
- Furnished and OHA-friendly rentals
- Typhoon-ready home features
- Local agents, property managers, and investor workflows

## Key decision

We will start with a **mobile-first PWA/web app** rather than native iOS/Android.

Reason: the demo needs to be easy to share, fast to iterate, and accessible by link. Native apps can be added later once MLS access, investor interest, and product-market fit are clearer.

## Local development

### API

```bash
cd api
bundle install
bin/rails db:prepare db:seed
bin/rails runner script/smoke.rb
bin/rails server
```

### Web

```bash
cd web
npm install
npm run dev
```

The web app expects the API at `http://localhost:3000` by default.

## Documentation

- [PRD](PRD.md)
- [Build Plan](BUILD_PLAN.md)
- [Architecture](docs/architecture.md)
- [Product Brief](docs/product/product-brief.md)
- [MVP Scope](docs/product/mvp-scope.md)
- [Decisions](docs/decisions.md)
- [MLS & Data Integration Notes](docs/mls-data-integration.md)
- [Locations LLC Research](docs/research/locations-llc.md)
- [Guam Market Research](docs/research/guam-market.md)
- [Roadmap](docs/roadmap.md)

## Repository

GitHub: `Shimizu-Technology/hafa-homes`
