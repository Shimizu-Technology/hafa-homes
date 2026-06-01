# Hafa Homes Auth and Roles Plan

_Last updated: 2026-06-01._

## Decision

Use Clerk for authentication across web and native mobile, with Rails as the source of truth for product roles and authorization.

## Roles

- `platform_admin` — Hafa Homes/Shimizu Technology operator with full platform access.
- `brokerage_admin` — future brokerage admin role, scoped to one brokerage once brokerage modeling exists.
- `agent` — future agent/realtor role, scoped to assigned listings/leads once brokerage modeling exists.
- `consumer` — public buyer/renter account.

Default admin bootstrap email:

```text
shimizutechnology@gmail.com
```

When that Clerk user first authenticates against the Rails API, Rails assigns `platform_admin` by default. All other public signups default to `consumer`.

## Architecture

### Clerk

- Mobile uses `@clerk/clerk-expo` and Clerk's official token cache backed by Expo SecureStore.
- Web uses `@clerk/clerk-react`.
- Public consumer signup is allowed.
- Browsing remains public; auth unlocks account and protected admin/broker areas.

### Rails

- Rails verifies Clerk JWTs using Clerk JWKS.
- Rails `users` table stores:
  - Clerk ID
  - email/name
  - role
  - invitation status fields for future invite flows
  - last sign-in timestamp
- Protected endpoints use `ClerkAuthenticatable`.

### Current protected endpoints

- `GET /api/v1/me`
- `GET /api/v1/leads`
- `GET /api/v1/data_sync_runs`
- `GET /api/v1/admin/users`

Listing search, listing detail, villages, lead creation, and privacy remain public.

## Environment variables

### API

```bash
CLERK_JWKS_URL=https://your-clerk-instance.clerk.accounts.dev/.well-known/jwks.json
CLERK_ISSUER=https://your-clerk-instance.clerk.accounts.dev
CLERK_SECRET_KEY=sk_live_or_test_xxx # optional fallback / future invite management
CLERK_AUDIENCE=hafa-homes-api # optional if JWT template uses aud
PLATFORM_ADMIN_EMAIL=shimizutechnology@gmail.com
```

### Web

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_live_or_test_xxx
VITE_CLERK_JWT_TEMPLATE=optional-template-name
```

### Mobile

```bash
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_or_test_xxx
EXPO_PUBLIC_CLERK_JWT_TEMPLATE=optional-template-name
```

## Implementation sequence

1. Auth/roles foundation.
2. Brokerage and agent models.
3. Lead routing by brokerage/agent.
4. Broker/admin lead inbox.
5. Server-backed saved listings.
6. Property-management preview.

## Notes

- Keep consumer browsing public to reduce friction.
- Do not rely only on Clerk metadata for authorization; use Rails roles.
- Future brokerage roles should be scoped by brokerage ID once brokerages exist.
- Add Sign in with Apple before enabling Apple/Google social auth in the public iOS app.
