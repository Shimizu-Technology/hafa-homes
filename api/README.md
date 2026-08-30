# Hafa Homes API

Rails 8.1 JSON API for the Hafa Homes public web/native apps and broker CRM. PostgreSQL/PostGIS stores listings, brokerages, users, search intent, leads, CRM records, and notification state.

## Local setup

```bash
cp .env.example .env
bundle install
bin/rails db:prepare db:seed
bin/rails runner script/smoke.rb
bin/rails server
```

The web and mobile clients must provide either an approved storefront host or the native build’s brokerage slug. Local requests may use `DEFAULT_BROKERAGE_SLUG=hafa-homes-demo`; do not use a default to hide missing production domain configuration.

## Complete gate

```bash
bin/rails test
bin/rails zeitwerk:check
bin/brakeman --no-pager --quiet
bin/bundler-audit check --update
bin/rubocop
bin/rails runner script/smoke.rb
```

## Tenant migration procedure

The PR #21 migrations scope legacy buyer profiles and saved searches to a brokerage.

Before a production migration:

1. Back up the database and verify restore access.
2. Count active brokerages and audit the true owner of every legacy profile/search.
3. If there is not exactly one active brokerage, set `LEGACY_BROKERAGE_SLUG` to the verified owner.
4. Run `bin/rails db:migrate` before deploying a web/native client that requires `/api/v1/context`.
5. Verify domain context, search profiles, saved searches, leads, staff access, and account deletion.

The migration fails instead of assigning records ambiguously. Rolling the buyer-profile migration back also fails once one user has profiles in multiple brokerages; records must be exported or consolidated deliberately first.

## Production operations

Production uses Solid Queue in the primary PostgreSQL database. Puma owns queue
execution by default, so the normal application process can deliver notifications
and run reconciliation without a second paid service. Run exactly one execution
owner:

- default: leave `SOLID_QUEUE_IN_PUMA` unset and run Puma in production;
- dedicated worker: set `SOLID_QUEUE_IN_PUMA=false` on Puma and run `bin/jobs` in
  one separately managed process;
- start with `JOB_CONCURRENCY=1`; increase it only after measuring queue latency,
  database load, and provider limits.

The notification path records durable state before enqueueing work. Email sends use
a stable Resend idempotency key and retry transient provider errors. A five-minute
reconciliation job re-enqueues orphaned queued delivery work. Interrupted SMS sends
are marked failed for manual review because ClickSend does not provide an idempotency
contract for this integration; automatically retrying an ambiguous send could text
someone twice.

Operational requirements:

- schedule `bin/rails privacy:prune_anonymous_intent` daily;
- configure and monitor Resend/ClickSend only when live sends are intended;
- set every permitted web origin in `WEB_ORIGINS`;
- add approved active `BrokerageDomain` records before serving a storefront;
- monitor queue depth, failed jobs, notification attempts, and stale queued/sending
  `NotificationDelivery` records;
- after enabling the Puma queue in production, watch Render memory/CPU and Neon
  compute for 24–48 hours before changing concurrency or splitting out a worker.

The staging/deploy-preview environment is intentionally deferred as of the 2026-08-16 Phase 1 refresh. A Netlify preview badge is not an end-to-end API/auth check.
