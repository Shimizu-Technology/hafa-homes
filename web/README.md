# Hafa Homes web

React/Vite public consumer experience and broker/admin CRM.

## Setup

```bash
cp .env.example .env
npm ci
npm run dev
```

The Rails API should be running at `VITE_API_URL`. Every API request carries `X-Brokerage-Host` from the current browser hostname so the API can resolve the storefront explicitly. Unknown or inactive explicit storefronts fail closed.

## Complete gate

```bash
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

Runtime brokerage context currently controls the public brokerage identity and two core color variables. Hafa-specific copy, the full color system, manifest/icons, provider domains, and other assets are not yet turnkey white-label. See `../docs/product/2026-08-16-review-findings-and-remediation-plan.md`.
