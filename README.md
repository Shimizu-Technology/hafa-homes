# Hafa Homes

**Hafa Homes** is a proposed Guam-first housing and real estate platform inspired by the Hawaii-focused Locations LLC app.

The goal is to build a polished, mobile-first experience for finding homes, rentals, neighborhoods, and real estate guidance on Guam — with local filters and workflows that national housing apps do not handle well.

## Working tagline

> Find your home on Guam.

## Project status

This repository contains the MVP/demo foundation:

- `/api` — Rails API with Postgres-backed seed data and initial listing/search endpoints
- `/web` — React/Vite/TypeScript PWA shell with Tailwind and app-like mobile UI
- `/mobile` — Expo/React Native iOS/Android app shell for the consumer mobile experience
- `/docs` — product, research, MLS, and architecture documentation

The first implementation target was a mobile-first PWA. Current direction is to keep the PWA for demo/admin/web/SEO while building a dedicated Expo native app as the broker/agent sales differentiator.

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

Start with a **mobile-first PWA/web app** for speed, then add a dedicated **Expo native app** for iOS/Android.

Reason: the PWA is easy to share, fast to iterate, and useful for web/admin/SEO. The native app helps position Hafa Homes as a real Guam real estate app instead of another brokerage website or IDX page.

## Local development

See [Local Development](docs/local-development.md) for the full API, web, and Expo mobile setup.

Quick start:

```bash
# Terminal 1: API
cd api
bundle install
bundle exec rails db:prepare db:seed
bundle exec rails server

# Terminal 2: Web PWA
cd web
npm install
npm run dev

# Terminal 3: Expo mobile
cd mobile
cp .env.example .env
npm install
npm run start
```

The web app uses `VITE_API_URL`; the mobile app uses `EXPO_PUBLIC_API_URL`. Both default to `http://localhost:3000` for local API development.

## Documentation

- [PRD](PRD.md)
- [Build Plan](BUILD_PLAN.md)
- [Architecture](docs/architecture.md)
- [Local Development](docs/local-development.md)
- [Product Brief](docs/product/product-brief.md)
- [MVP Scope](docs/product/mvp-scope.md)
- [Platform Strategy](docs/product/platform-strategy.md)
- [Brokerage Platform Plan](docs/product/brokerage-platform-plan.md)
- [White-Label Brokerage Platform Plan](docs/product/white-label-brokerage-platform-plan.md)
- [August 1 Demo Plan](docs/product/august-1-demo-plan.md)
- [Auth and Roles Plan](docs/product/auth-roles-plan.md)
- [Consumer Account Plan](docs/product/consumer-account-plan.md)
- [Native Mobile Plan](docs/product/native-mobile-plan.md)
- [Local Intel Plan](docs/product/local-intel-plan.md)
- [SSI Automation / Hafa Homes Meeting Notes](docs/meetings/2026-06-01-ssi-automation-hafa-homes.md)
- [Broker Feedback / Real Geeks Notes](docs/meetings/2026-06-05-broker-feedback-realgeeks.md)
- [Feature Ideas](docs/product/feature-ideas.md)
- [Decisions](docs/decisions.md)
- [MLS & Data Integration Notes](docs/mls-data-integration.md)
- [Locations LLC Research](docs/research/locations-llc.md)
- [Real Geeks Competitive Analysis](docs/research/realgeeks-competitive-analysis.md)
- [Guam Market Research](docs/research/guam-market.md)
- [Roadmap](docs/roadmap.md)
- [Current Status & Next Steps](docs/product/current-status-next-steps.md)
- [App Store / TestFlight Release Notes](docs/app-store-release.md)

## Repository

GitHub: `Shimizu-Technology/hafa-homes`
