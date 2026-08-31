# Hafa Homes Product Brief

> Product-origin snapshot. The thesis remains useful, but implementation status in this document is historical. Use `current-product-truth.md` for current behavior.

## Name

**Hafa Homes**

Domain target: `HafaHomes.com`

## One-liner

A Guam-first housing app for homes, rentals, neighborhoods, military relocation, and trusted local real estate guidance.

## Inspiration

The main reference product is **Locations LLC**, a Hawaii-focused real estate app and website that combines MLS search, local market statistics, neighborhood/condo search, home valuation, and agent lead routing.

Hafa Homes should take the same local-first philosophy and adapt it to Guam.

## Problem

Guam has real estate websites and broker IDX pages, but the experience is fragmented and often feels less modern than national housing apps. National apps are not optimized for Guam-specific housing needs.

Important Guam-specific needs include:

- Military families relocating to Guam
- Rentals near Andersen AFB, Naval Base Guam, Camp Blaz, and Naval Hospital
- Pet-friendly and furnished rentals
- OHA/military-friendly rental workflows
- Village and commute-based search
- Typhoon readiness features
- Generator, water tank, shutters, fenced yard, split AC, and parking filters
- Local agent and property manager relationships
- Investor-friendly market data

## Target users

### Primary users

- Renters looking for housing on Guam
- Buyers looking for homes, condos, or land
- Military families moving to Guam
- Local residents moving between villages
- Investors looking for rental/income property

### Business users

- Real estate agents
- Brokerages
- Property managers
- Landlords/owners
- Investor clients
- Mortgage/referral partners

## Product positioning

Hafa Homes should not position itself as a generic MLS search tool. It should be the local housing guide for Guam.

Suggested positioning:

> Hafa Homes helps you find the right place on Guam — with local search filters, military relocation tools, rental alerts, village guides, and trusted real estate support.

## Differentiation

Compared to national apps:

- Guam-first search and copy
- Better local filters
- Military relocation emphasis
- Rental/property management support
- Village lifestyle guidance
- Local market snapshots
- Agent/property manager workflows

Compared to existing Guam IDX sites:

- More polished mobile-first UX
- App-like PWA experience
- Better saved search and alerts experience
- Better map/list exploration
- Better storytelling and neighborhood content
- Better investor/demo pitch

## Business model direction

Current working direction after Mike/Leon discussions:

> Hafa Homes is the consumer-facing Guam real estate app. Brokerages and agents subscribe to participate, connect or authorize their MLS/listing feed, publish their listings/agents, and receive leads through the platform.

Brokerages/agents are not paying Hafa Homes for MLS data itself. They are paying for:

- app-first mobile search experience
- listing and agent distribution
- lead capture and lead routing
- saved searches and buyer/renter intent
- brokerage/agent profile presence
- MLS/feed integration support
- analytics and admin workflows
- future native iOS/Android app presence

Possible revenue streams:

1. Brokerage subscription
2. Per-agent subscription/seats
3. Setup/onboarding fee
4. MLS/feed integration fee
5. Featured agents/listings
6. Mortgage/prequalification referrals
7. Property management/rental tools

## Current product status

As of PR #10, Hafa Homes has moved beyond the initial MVP/demo foundation. It now includes:

- public web/PWA and Expo mobile consumer surfaces
- Clerk auth and server-backed saved homes
- broker/agent tenancy
- staff/admin lead inbox and tenant scoping
- showing appointments and consumer request history
- safe notification logging/foundation
- broker CRM notes, tasks, and activity timeline

The next major gap is the broker-branded website/app layer, proving that the same platform can power each brokerage’s customer-facing experience.

## MVP / demo goal

Create a polished demo that Mike, John, and trusted broker contacts can open and understand immediately.

The demo should prove:

- The app can feel like a Guam version of Locations LLC.
- The search experience can be better than existing Guam sites.
- The broker CRM can manage real lead follow-up.
- The same platform can support broker-branded sites/apps.
- The platform can support MLS-integrated listings later after authorization.
- The local angle is the value, not just the listing feed.
