# Privacy and data retention operations

_Last updated: 2026-07-10_

This document records the product behavior implemented by Hafa Homes. It is an engineering and operations reference, not a substitute for legal review by a broker or attorney.

## Data boundaries

- Brokerage routing is resolved from an approved domain or the native app's configured brokerage slug.
- An explicit unknown or inactive domain/slug fails closed; it is not routed through a default brokerage.
- Agent lists, intent sessions, buyer/search profiles, leads, and CRM access are tied to that routing brokerage.
- Full-market listing search remains shared because a broker site is expected to display authorized market inventory. Listing attribution remains separate from the brokerage receiving the inquiry.
- Anonymous intent sessions are never claimed by a later signed-in account.

## Retention behavior

- Anonymous, unconverted lead-intent sessions expire after 90 days by default.
- Run `bin/rails privacy:prune_anonymous_intent` from the API directory daily. Override the period with `LEAD_INTENT_ANONYMOUS_RETENTION_DAYS`.
- Signed-in profile data remains until the consumer edits or deletes the account.
- Account deletion removes saved homes and brokerage-scoped buyer/search profiles, detaches the account from submitted leads, and requests deletion of the Clerk identity.
- Submitted showing, price-watch, and contact requests remain available to the receiving brokerage for follow-up and recordkeeping after the consumer account is deleted.

## Operational requirements before a broker pilot

1. Confirm the broker's legal privacy notice and retention requirements.
2. Add the broker's approved domains to `brokerage_domains`.
3. Configure a unique brokerage slug in each native build.
4. Limit staff memberships to the brokerages they are authorized to access.
5. Schedule the anonymous-intent pruning task and document who responds to deletion requests.
6. Review analytics, notification, authentication, hosting, and mapping vendors in the public privacy policy.
7. Run a Solid Queue worker and monitor queued/failed notification deliveries; creating a queued record is not proof of delivery.

Scheduling remains an operational launch gate. The job and rake task existing in the repository do not mean pruning is running in production.
