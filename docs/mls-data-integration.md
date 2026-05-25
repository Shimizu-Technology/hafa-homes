# MLS & Data Integration Notes

## Current understanding

The main technical/business dependency is access to reliable listing data.

Mike noted that the key concern is:

> Getting the software to update whenever there are daily changes on the MLS.

Mike later confirmed that Guam brokers use `my.flexmls.com` / Flexmls as the MLS platform. Brokers/agents already pay for their MLS access/membership, and the business opportunity is to provide the app/search/lead platform that connects to authorized listing feeds.

This is a normal real estate app requirement. The coding side is straightforward if authorized access is provided. The bigger question is permission, contract terms, MLS/Flexmls approval, and the exact feed/API format.

## Data access options

### Option 1: Direct MLS/IDX/API feed

Best long-term path if available.

Potential formats/vendors:

- RESO Web API
- RETS
- IDX provider API
- MLS vendor API
- XML/CSV feed
- FTP export

### Option 2: Participating brokerage/agent-authorized access

If a brokerage or agent subscribes to Hafa Homes and has MLS/IDX access, they may be able to authorize Hafa Homes as their technology/vendor platform.

This is currently the leading business hypothesis: brokerages/agents subscribe to Hafa Homes, connect or authorize their MLS/listing feed, and receive leads through the app.

This may be faster than independently applying for direct MLS access, but it still requires confirming Flexmls/MLS rules.

### Option 3: Manual/admin listings

Good for demo and possibly early MVP.

Admin users can manually add listings or import CSVs while MLS access is being finalized.

### Option 4: Property manager/owner submissions

Useful for rentals, especially if rental inventory is not fully covered by MLS.

Could eventually support:

- Landlord listing submission
- Property manager dashboard
- Listing approval workflow
- Featured rental listings

## Sync architecture concept

When MLS/API access is available, the app should include a scheduled sync process.

Basic flow:

1. Fetch listing feed on a schedule
2. Normalize incoming data into internal listing schema
3. Upsert listings by MLS/listing ID
4. Download/cache image URLs or store remote references
5. Detect status changes
6. Detect price changes
7. Mark missing/expired listings inactive
8. Log sync errors
9. Trigger saved-search alerts
10. Show admin sync health dashboard

## Suggested sync frequency

Depends on MLS rules and API limits.

Possible schedules:

- Every 15 minutes for near-real-time feeds
- Hourly
- Twice daily
- Daily

For demo/investor explanation, we can say:

> Hafa Homes will support scheduled MLS syncs, and the exact frequency will follow the MLS/IDX provider's rules and limits.

## Data fields needed

### Core listing fields

- MLS/listing ID
- Status
- Property type
- Sale/rent
- Price/rent
- Address
- Village/city
- Latitude/longitude
- Beds
- Baths
- Square footage
- Lot size
- Year built
- Description
- Photos
- Listing agent/brokerage
- Contact attribution
- Last updated

### Guam-specific fields

- Near Andersen AFB
- Near Naval Base Guam
- Near Camp Blaz
- Near Naval Hospital
- Pet friendly
- Furnished
- OHA/military friendly
- Generator
- Water tank
- Typhoon shutters
- Split AC
- Fenced yard
- Gated community
- Pool
- Ocean view
- Parking
- Utilities included

Some of these may not exist directly in the MLS feed and may need to be derived from descriptions, manually tagged, or added by admins.

## Important compliance questions

Before using real MLS data, confirm:

- Who can authorize access?
- Is Hafa Homes considered an IDX/vendor display?
- Can Hafa Homes operate as an independent consumer platform with multiple participating brokerages?
- Can each brokerage/agent authorize their own feed into the same Hafa Homes app?
- Does the feed include all IDX-approved MLS listings or only that brokerage/agent's listings?
- Can non-subscribed brokerage listings appear?
- Are sold listings allowed?
- Are rental listings included?
- Are photos included?
- What attribution is required?
- How often must data refresh?
- What disclaimers are required?
- Are registration walls required for certain data?
- Can leads go to listing agent, selected agent, sponsoring broker, or any subscribing agent?
- Can listings be cached?
- Can data be used for market reports/analytics?

## Demo recommendation

For the first demo, use seed data and label it internally as sample/demo data. Avoid using unauthorized real listing data unless a partner explicitly provides permission.
