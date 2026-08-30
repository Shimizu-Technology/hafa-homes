# Hafa Homes Auth and Roles Plan

_Last updated: 2026-06-10 after broker platform, scheduling, and CRM merges._

## Decision

Use Clerk for authentication across web and native mobile, with Rails as the source of truth for product roles and authorization.

## Roles

- `platform_admin` — Hafa Homes/Shimizu Technology operator with full platform access.
- `brokerage_admin` — brokerage admin role, scoped through active brokerage memberships.
- `agent` — agent/realtor role, scoped to assigned/scoped leads only when an active brokerage membership and an active linked agent profile agree on the brokerage.
- `consumer` — public buyer/renter account.

Default admin bootstrap email:

```text
shimizutechnology@gmail.com
```

When `PLATFORM_ADMIN_EMAIL` is set to that address, that Clerk user is assigned `platform_admin` on first API authentication. Seeds also create a pending `platform_admin` user for that address. If the env var is absent, Rails logs a warning and all public signups default to `consumer`.

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

Consumer/account:

- `GET /api/v1/me`
- `GET /api/v1/me/saved_listings`
- `GET /api/v1/me/leads`

Staff/admin:

- `GET /api/v1/leads`
- `GET /api/v1/leads/:id`
- `PATCH /api/v1/leads/:id`
- showing appointment staff endpoints
- lead notes/tasks/activity staff endpoints
- `GET /api/v1/data_sync_runs`
- `GET /api/v1/admin/dashboard`
- `GET /api/v1/admin/users`
- `GET /api/v1/admin/brokerages`
- `GET /api/v1/admin/agents`

Listing search, listing detail, villages, public lead creation, and privacy remain public.

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

Completed:

1. Auth/roles foundation.
2. Server-backed saved listings and signed-in lead association.
3. Brokerage and agent models.
4. Lead routing by brokerage/agent.
5. Broker/admin lead inbox.
6. Consumer inquiry history.
7. Showing scheduling.
8. CRM notes/tasks/activity.

Still future:

1. Domain-first broker-branded public website/app layer.
2. Lead quality/verification/automation.
3. Property-management preview.

## Notes

- Keep consumer browsing public to reduce friction.
- Do not rely only on Clerk metadata for authorization; use Rails roles.
- Brokerage roles are scoped by active brokerage membership. Agent authorization requires both that active membership and an active linked profile in the same brokerage; revoking or removing the membership immediately removes staff access even if the profile still exists.
- Saved homes require auth because they are user-owned and server-backed.
- Showing requests stay public for lead conversion, but attach `user_id` when submitted by a signed-in user.
- Add Sign in with Apple before enabling Apple/Google social auth in the public iOS app.
