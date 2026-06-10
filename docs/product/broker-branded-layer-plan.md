# Domain-First Broker-Branded Website/App Layer Plan

_Last updated: 2026-06-10 after PR #10 broker CRM expansion merged._

## Decision

Broker-branded experiences should be **domain-first**, not slug-first.

The real broker-facing product should feel like:

```text
homeventuresguam.com
search.homeventuresguam.com
empirerealtyguam.com
```

not primarily:

```text
hafahomes.com/brokerages/home-ventures
```

Slugs still matter, but only as an implementation and preview tool for local development, Netlify previews, demos before DNS is configured, and support URLs.

## Purpose

This is the next major product layer after broker tenancy, request/showing workflows, notifications, and CRM depth.

Goal:

> Prove that one shared Hafa Homes platform can power broker-owned domains and broker-branded app experiences while keeping the Rails backend, React web app, and Expo mobile app shared.

This directly follows the Mike/John feedback that brokers may want their actual website/app experience powered by Hafa Homes, not only a generic Hafa Homes marketplace profile.

## Target architecture

```text
Broker-owned domains
  homeventuresguam.com
  search.homeventuresguam.com
  empirerealtyguam.com
        |
        v
Shared React web app deployment(s)
  tenant resolved by request host
        |
        v
Shared Rails API
  brokerages, domains, agents, listings, leads, CRM, auth, notifications
        |
        v
Shared multi-tenant database initially
```

Mobile follows the same platform principle:

```text
Hafa Homes iOS app
Broker-branded iOS app when justified
Broker-branded Android app when justified
        |
        v
Same Expo codebase with broker-specific config/build profile
        |
        v
Same Rails API
```

## What is shared

Shared by default:

- Rails API.
- database initially.
- React web/admin codebase.
- Expo mobile codebase.
- auth/roles/tenant scoping.
- listings/search/feed adapter logic.
- lead routing.
- CRM notes/tasks/activity timeline.
- showing scheduling.
- notification delivery logs.
- admin CRM.

## What is broker-specific

Broker-specific configuration:

- owned domain(s).
- logo.
- colors.
- public name and tagline.
- homepage copy.
- hero imagery.
- agent roster.
- listing/search default scope.
- lead routing.
- compliance/disclaimer copy.
- optional app name/icon/splash/bundle ID.
- whether “Powered by Hafa Homes” appears.

## Why domain-first is better than slug-first

### Broker perception

A broker is much more likely to see value in:

> “We can take over and modernize your existing brokerage website.”

than:

> “You get a page under Hafa Homes.”

This aligns with Mike/John’s broker feedback and Real Geeks positioning: brokers buy a website/app/CRM funnel, not just a marketplace listing.

### Brand ownership

Brokerages already have brands, domains, signs, cards, and agents pointing people to a website. Taking over or powering that existing URL keeps the broker’s brand front-and-center.

### Lead conversion

A broker-owned domain avoids consumer confusion and keeps leads in that brokerage’s funnel while still letting Hafa Homes power the technology behind it.

### Platform scalability

Domain-based tenancy lets Hafa Homes support many brokerages without code forks.

## Role of slugs

Slugs still exist, but they are not the primary product experience.

Use slugs for:

- local development: `localhost:5173/brokerages/home-ventures`.
- preview links before DNS is ready.
- Netlify deploy previews.
- support/admin fallback links.
- sharing demos with Mike/John/brokers before a domain is connected.

Final broker-facing URLs should use custom domains whenever possible.

## Recommended data model

### BrokerageDomain

Add a `brokerage_domains` table:

```text
brokerage_id: references brokerages, required
host: string, required, unique, normalized lowercase
status: string, e.g. pending, active, disabled
primary: boolean, default false
verified_at: datetime
last_seen_at: datetime optional
notes: text optional
```

Examples:

```text
homeventuresguam.com -> Home Ventures
www.homeventuresguam.com -> Home Ventures
search.homeventuresguam.com -> Home Ventures
empirerealtyguam.com -> Empire Realty
```

Rules:

- One brokerage can have multiple domains.
- A host belongs to only one brokerage.
- One domain can be marked primary per brokerage.
- Unknown hosts should fall back to Hafa Homes or show a safe not-found/tenant-unconfigured state.

### Brokerage branding/config

For the first version, simple fields on `brokerages` are acceptable. A separate `BrokerageBranding` model can come later if branding becomes complex.

Suggested first fields:

- `public_name`
- `tagline`
- `brand_primary_color`
- `brand_accent_color`
- `logo_url`
- `hero_image_url`
- `public_phone`
- `public_email`
- `address`
- `about` / `description`
- `website_url`
- `show_powered_by_hafa_homes`
- `compliance_disclaimer`

Potential later fields/models:

- `BrokerageBranding`
- `BrokerageTheme`
- `BrokerageDomain`
- CMS-style homepage blocks
- SEO metadata
- social links
- subscription/package metadata

## Tenant resolution

Add one central resolver so tenant logic is not scattered across controllers/components.

Example service:

```ruby
BrokerageTenantResolver.call(host:, slug: nil, default_to_hafa_homes: true)
```

Resolution order:

1. custom domain host via `BrokerageDomain.active`.
2. explicit slug fallback for preview/dev routes.
3. optional default Hafa Homes tenant.
4. safe not-found/unconfigured tenant response.

This service should normalize hosts:

- lowercase.
- strip ports for local dev.
- handle `www.` if both apex and www are configured.
- avoid trusting arbitrary user-submitted brokerage IDs.

## Web frontend strategy

### First implementation

Use the existing React/Vite web app.

Support both:

```text
broker-owned-domain.com
```

and preview routes:

```text
hafahomes.com/brokerages/:slug
localhost:5173/brokerages/:slug
```

The app should call an API endpoint like:

```text
GET /api/v1/tenant/resolve?host=homeventuresguam.com
```

or rely on the API receiving the host/header in broker-specific public endpoints.

### Deployment options

Option A — same Netlify site with many custom domains:

- simplest early operationally;
- each broker domain points to the same web deployment;
- runtime host decides tenant.

Option B — separate Netlify sites/deploy contexts from same repo/codebase:

- still no code fork;
- useful if a broker needs different env config, stricter redirects, or separate analytics;
- more operational overhead.

Recommended first path:

> Same web codebase and likely same deployment, with custom domains mapped to the app and host-based tenant resolution.

### SEO caveat

If broker website takeover becomes serious, SEO matters. The current Vite SPA can work for the first demo/foundation, but later we should evaluate:

- static rendering / prerendering;
- Next.js/Astro broker public site layer;
- sitemap generation per broker domain;
- canonical URLs per broker domain;
- structured data for broker/agents/listings.

Do not migrate the frontend just for the first domain-ready PR. Design the API/tenant model so a future SEO-focused frontend can reuse it.

## Public API endpoints

Recommended first endpoints:

```text
GET /api/v1/tenant/resolve
GET /api/v1/brokerages/:slug
GET /api/v1/brokerages/:slug/listings
GET /api/v1/brokerages/:slug/agents
GET /api/v1/brokerages/:slug/agents/:id
```

When a custom domain is active, the web app can use tenant resolution first, then call endpoints using the resolved brokerage slug/id.

Payloads must include only public-safe fields.

## Lead routing rules

Public clients must not be allowed to spoof brokerage/agent ownership.

Rules:

- Public lead forms may submit route context, host context, or `brokerage_slug`.
- Public lead forms must not submit trusted `brokerage_id` or `assigned_agent_id`.
- Rails resolves the brokerage from custom domain/slug/listing context.
- If a listing belongs to a brokerage, listing attribution wins.
- If a broker-branded general inquiry has no listing, route to the resolved brokerage.
- Signed-in users still attach `user_id` server-side.

## First broker-branded web pages

### Brokerage homepage

Primary final URL:

```text
https://broker-owned-domain.com/
```

Preview URL:

```text
https://hafahomes.com/brokerages/:slug
```

Sections:

- broker hero with logo/name/tagline.
- featured/latest listings.
- agent roster preview.
- buyer/renter CTA.
- seller CTA placeholder.
- property-management CTA placeholder.
- contact card.
- compliance/disclaimer block.
- “Powered by Hafa Homes” footer if enabled.

### Brokerage search/listings

Final URL:

```text
https://broker-owned-domain.com/listings
```

Preview URL:

```text
https://hafahomes.com/brokerages/:slug/listings
```

Behavior:

- reuse existing listing cards/search UI where possible;
- filter listings by resolved brokerage;
- preserve Guam-first filters and Local Intel;
- make brokerage brand visible in header/CTA;
- route showing/contact forms to the brokerage.

### Agent roster/profile

Final URLs:

```text
https://broker-owned-domain.com/agents
https://broker-owned-domain.com/agents/:agentId
```

Preview URLs:

```text
https://hafahomes.com/brokerages/:slug/agents
https://hafahomes.com/brokerages/:slug/agents/:agentId
```

Initial public fields:

- name;
- photo placeholder or URL;
- phone/email;
- brokerage;
- active listings count;
- contact CTA;
- bio later.

## Admin/editor scope

Do not overbuild a CMS in the first PR.

First version can be:

- seed/demo branding data;
- platform-admin editable fields later;
- docs that define what broker onboarding/config will require.

A full page builder is out of scope.

## Mobile / Expo app configuration

First domain-ready PR should document and lightly prepare app branding. It does not need to ship a broker app.

Future config values:

- `EXPO_PUBLIC_DEFAULT_BROKERAGE_SLUG`
- app display name
- icon/splash assets
- primary/accent color
- default brokerage tenant
- bundle ID/package name

Future EAS profile pattern:

```text
hafa-homes-production
broker-homeventures-preview
broker-homeventures-production
```

Important Apple caveat:

- Apple may reject many templated white-label apps.
- Broker-specific iOS apps may need broker-owned developer accounts or materially distinct branding/content.
- Alternative: one Hafa Homes app with broker-branded experiences inside it.

## Domain onboarding flow

For each broker domain:

1. Confirm broker owns the domain and which records are currently used.
2. Preserve email/MX records.
3. Decide apex vs subdomain:
   - `broker.com`
   - `www.broker.com`
   - `search.broker.com`
4. Add `BrokerageDomain` record in Hafa Homes.
5. Configure Netlify/custom domain/SSL.
6. Broker updates DNS records.
7. Verify domain resolves and SSL is active.
8. Mark domain active/verified.
9. Test lead routing, listing pages, and contact forms.
10. Set canonical/primary domain behavior.

## Out of scope for first domain-ready PR

Do not include yet:

- real MLS/Flexmls integration;
- production DNS automation;
- many broker-specific EAS builds;
- live broker app-store submissions;
- full CMS/page builder;
- broker subscription billing;
- full property-management module;
- SEO framework migration;
- push notifications.

## Acceptance criteria for first PR

The first domain-ready broker-branded PR is successful when:

- `BrokerageDomain` exists or is clearly represented in code/docs;
- tenant resolver supports host-based lookup and slug fallback;
- there is at least one branded brokerage public page;
- there is a brokerage-scoped listing/search page;
- agent roster/profile basics exist;
- general inquiries from a brokerage-branded page route to that brokerage;
- listing/showing requests still route safely through server-side ownership rules;
- unknown domains do not leak another brokerage’s data;
- platform/staff tenant scoping remains intact;
- docs explain domain-first shared-codebase architecture;
- web build, API smoke, mobile typecheck/doctor pass.

## Suggested implementation sequence

### Step 1 — Data and tenant resolution

- Add `BrokerageDomain`.
- Add/seed branding fields.
- Add `BrokerageTenantResolver`.
- Add safe tenant resolution endpoint.

### Step 2 — Public serializers and endpoints

- Add public brokerage serializer.
- Add public agent serializer or safe subset.
- Add listing filter by resolved brokerage.
- Add public brokerage routes/controllers.

### Step 3 — Public web pages

- Add domain-aware public shell.
- Add `BrokerageHomePage`.
- Add `BrokerageListingsPage`.
- Add `BrokerageAgentsPage`.
- Add `BrokerageAgentPage`.
- Add broker-branded CTAs and footer.

### Step 4 — Lead routing

- Add safe host/slug handling for public lead creation.
- Add tests/smokes proving public users cannot spoof IDs.
- Verify signed-in users still attach `user_id` server-side.

### Step 5 — Mobile/app config plan

- Add docs and config examples for broker app builds.
- Optionally add placeholder env support for default brokerage slug.

### Step 6 — Polish and verification

- Responsive pass on mobile/desktop.
- Web build.
- API migration rollback/migrate.
- API smoke.
- Mobile typecheck/doctor.

## Demo script after this PR

1. Open Hafa Homes public app as the reference marketplace.
2. Open a broker-branded custom-domain or preview-domain page.
3. Show the same shared listings/search UX scoped to that brokerage.
4. Open an agent profile.
5. Submit a showing/contact request.
6. Open admin lead detail and show the lead is routed to the brokerage.
7. Show the CRM workspace: status, assignment, notes, tasks, timeline, showing schedule.
8. Explain that MLS integration plugs in once a broker authorizes the feed.
9. Explain that broker-specific apps can use the same Expo codebase/config when justified.

## Open questions before building

- What should the first demo brokerage brand/domain be?
- Should the first real broker site be apex domain, `www`, or `search.` subdomain?
- Should broker public pages use the current Vite app only, or should we plan an SEO frontend later?
- What fields are public-safe for agents?
- Should general brokerage inquiries create `lead_type = brokerage_inquiry`, or reuse an existing type?
- Should broker-branded pages include property-management CTAs now as placeholders?
- Which brokerage should be the first real pilot/demo target?
