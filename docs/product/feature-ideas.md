# Feature Ideas

_Last updated: 2026-05-24 after Leon/Mike Hafa Homes discussion._

## Neighborhood intelligence

Mike called out that Hafa Homes should help users understand what is around a listing, not only show the listing itself.

Working concept:

> “What’s in your neighborhood?”

Potential listing/village content:

- public school district / public schools likely associated with the area
- nearby private schools
- nearby parks and recreation
- grocery stores and daily essentials
- restaurants/cafes
- beaches and outdoor areas
- commute to Andersen AFB
- commute to Naval Base Guam
- commute to Camp Blaz
- commute to Naval Hospital
- commute to Hagatna/Tumon major work areas
- village overview and lifestyle notes
- typhoon-readiness/local infrastructure notes eventually

Why this matters:

- Helps families relocating to Guam evaluate areas quickly.
- Gives Hafa Homes a local advantage over generic MLS/search sites.
- Creates useful content that existing IDX integrations often lack.
- Can drive SEO and consumer trust over time.

Implementation path:

1. Start with manually curated village data.
2. Add seeded schools/parks/amenities by village.
3. Show a “Nearby” section on listing detail pages.
4. Add village pages with schools, parks, commute notes, and active listings.
5. Later, use geocoding/places APIs if needed.

## Mortgage calculator and affordability guide

Mike suggested adding a mortgage calculator so users can understand rough monthly payments before reaching out.

The feature should be more guided than a basic calculator.

Potential flow:

1. Start from a listing detail page.
2. Pre-fill purchase price.
3. User adjusts:
   - down payment
   - interest rate
   - loan term
   - taxes/insurance estimate
   - HOA/condo fee if applicable
4. Show estimated monthly payment.
5. Explain what the estimate means in plain language.
6. CTA:
   - “Ask about financing”
   - “Talk to an agent”
   - “Schedule a showing”
   - “Get prequalified” later if partner exists

Possible UX angle:

> Walk buyers through the process instead of just dumping numbers on them.

Example guidance:

- “If you put 10% down…”
- “If you put 20% down…”
- “Here is what your monthly payment might look like.”
- “Here are questions to ask a lender.”
- “This is not a preapproval; it is an estimate.”

Why this matters:

- Converts browsing into serious buyer intent.
- Helps agents qualify leads.
- Provides a future referral path for mortgage/lending partners.
- Makes the product more useful than a basic listing site.

## Agent/realtor contact experience

The app should avoid generic “contact team” CTAs when possible.

Potential improvements:

- show actual agent headshot/name/brokerage
- listing agent card on detail page
- “Schedule tour with [Agent]”
- “Message [Agent]”
- preferred contact method
- available times
- agent profile page
- broker/team page

Why this matters:

- Builds trust.
- Helps subscribing agents see direct value.
- Makes lead routing clearer.

## Map marker preview sheet

Instead of immediately navigating when a user taps a price marker, open a bottom-sheet preview.

Preview should include:

- photo
- price
- beds/baths/sqft
- village
- save button
- schedule tour/contact CTA
- link to full details

Why this matters:

- Feels closer to major real estate apps.
- Keeps users in the map experience longer.
- Reduces back-and-forth navigation friction on mobile.

## Saved searches and alerts

Saved search should eventually become a real account-backed feature.

Potential alerts:

- new matching listing
- price change
- status change
- open house/new showing availability
- saved listing update

Channels:

- email first
- SMS later
- push notifications if native app/PWA notifications are added

## Broker/agent admin tools

For the subscription model, subscribers need a dashboard.

Potential features:

- lead inbox
- lead status: new/contacted/touring/qualified/closed/lost
- assign lead to agent
- notes/follow-up history
- listing performance
- saved/search interest by listing
- agent profile management
- brokerage profile management
- export CSV

## Native app packaging

Historical note: this packaging idea was superseded by the dedicated Expo/React Native app, which now ships on iOS and shares API/domain contracts with the web product.

The earlier option was to:

- keep React/Vite app as core
- wrap with Capacitor
- add native app icons/splash
- evaluate push notifications
- publish to App Store / Google Play after MLS/product validation

The PWA remains useful for broker sites, admin, SEO, and fast iteration; native release work belongs in `/mobile` and the App Store/Android release plans.

## Meeting source

Source notes/transcript:

- `Brain-Dump/work/shimizu-tech/Michael Sazaki (BOH)/2) Talk with Mike about HafaHomes and Shimizu Technology - May 24, 2026.md`
