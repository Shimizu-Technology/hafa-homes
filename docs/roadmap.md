# Roadmap

## Phase 0: Planning and validation

Status: current

Tasks:

- Choose project name
- Create repo
- Document research and decisions
- Define MVP scope
- Confirm target demo audience
- Confirm domain availability and purchase if desired

## Phase 1: PWA demo

Goal: Build a polished clickable/functional demo that Mike and investor can review on mobile.

Features:

- Mobile-first Hafa Homes UI
- Home/search landing page
- Buy/rent filters
- Sample Guam listings
- Search results list/map concept
- Listing detail pages
- Favorites/saved search concept
- Military relocation page
- Village pages
- Lead capture forms
- MLS sync/admin concept page

Data:

- Seed/demo listings
- Demo villages
- Demo feature tags

Deliverable:

- Hosted demo URL
- GitHub repo with code and docs

## Phase 2: Data access and platform model discovery

Goal: Determine how real listing data can be legally/technically integrated and validate the broker/agent subscription model.

Current signal from Mike:

- Guam brokers use `my.flexmls.com` / Flexmls.
- Brokerages/agents already pay for MLS access.
- Hafa Homes can be positioned as the app/search/lead platform that connects to authorized listing feeds.
- The likely model is brokerages/agents subscribing to participate, publish listings/agents, and receive leads through Hafa Homes.

Tasks:

- Confirm Flexmls/Guam MLS access path
- Confirm whether Hafa Homes can be approved as vendor/app platform
- Confirm whether multiple brokerages can authorize feeds into one consumer app
- Determine feed format: IDX, RESO Web API, RETS, Flexmls IDX, embed/iframe, CSV/export, etc.
- Review display/compliance rules
- Confirm sold/rental data availability
- Confirm refresh requirements
- Confirm attribution/disclaimer requirements
- Confirm listing photo rights
- Validate first pilot brokerage/agent
- Validate pricing model: setup fee, monthly subscription, per-agent seats, featured placement

Deliverable:

- Data integration plan
- Platform/business model plan
- Updated technical architecture

## Phase 3: Broker/agent marketplace MVP

Goal: Turn demo into working product with authorized data and broker/agent participation.

Features:

- Real listing import/sync
- Brokerage profiles
- Agent/realtor profiles
- Listing ownership/attribution by brokerage/agent
- Admin dashboard
- Broker/agent lead inbox
- Listing normalization
- Search/filter implementation
- Saved listings
- Saved searches
- Email/SMS alerts
- Lead routing to listing agent/brokerage
- Contact/showing request flows
- Basic analytics
- Neighborhood intelligence sections
- Mortgage calculator / affordability guide

## Phase 4: Business workflows

Goal: Support agents/property managers/investor operations.

Possible features:

- Agent dashboard
- Lead assignment
- Property manager dashboard
- Owner listing submissions
- Featured listings
- Rental inquiry management
- Market snapshots
- Village demand analytics

## Phase 5: Native mobile app

Goal: Build a dedicated iOS/Android consumer app once the PWA proof-of-concept and broker/agent interest are validated.

Current direction: add a new Expo app in `/mobile` while keeping `/web` for the PWA, landing pages, SEO/content, and admin/broker dashboards.

Mike noted that brokerages may already have websites, so app-store/native app presence can become a selling point.

Recommended path:

- Keep Rails API as shared backend
- Keep `/web` live for demo/admin/web/SEO
- Add `/mobile` Expo app
- Build native listing list/detail
- Build native map search with marker preview bottom sheet
- Add contact/showing/saved flows
- Package with EAS Build for TestFlight/Google Play testing

Reasons to do native:

- App-store presence helps sales pitch
- Better consumer app positioning than another brokerage website
- Push notifications become important
- Strong consumer adoption
- Need deeper mobile capabilities
- Brokerages/agents want to say their listings are in a real mobile app

See: `docs/product/native-mobile-plan.md`

## Phase 6: Expansion

Potential expansion areas:

- Mortgage/prequalification referrals
- Property management tools
- Rental applications
- Document upload
- Tenant screening integrations
- Relocation service marketplace
- Market reports and investor dashboards
