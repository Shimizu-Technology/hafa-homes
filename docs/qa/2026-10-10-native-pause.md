# Hafa Homes native pause release

## Context and acceptance

Leon requested a signed iOS update for TestFlight and, if eligible, public App Review. Hafa Homes is Shimizu Technology's Guam home-search and brokerage CRM demonstration platform; it has no authorized MLS production feed. The October 10 website release at `bdd070c4d0b0543715edd802ed34ba465aba6564` publishes a static paused status. Render is suspended and Neon compute is idle to avoid unused hosting charges. The installed iOS versions do not understand this status.

Sources: `docs/product/current-product-truth.md`, `docs/app-store-release.md`, `docs/qa/2026-10-10-pause.md`, and Leon's explicit release request. Scope: native availability gate, recovery, support/privacy access, signed delivery. Listings, CRM, authentication, deletion processing, and notification delivery require the paused backend and are excluded from live operational QA. No backend reactivation or hosting plan change is authorized by this release.

Required native acceptance: check the static CDN before auth/API initialization; show a clear pause notice; block API calls while paused or backgrounded; retry status without backend traffic; bound failed checks to five seconds; preserve the runtime across brief checks that return available and unmount it on confirmed pause/unavailability; keep privacy and support reachable. Production bundles must always use the canonical status URL. Internal TestFlight requires these checks, repository gates, reviewed source, signed archive verification, Apple processing, and tester availability. Public review additionally requires physical-iPhone acceptance and a functioning account-deletion initiation route; email support alone does not satisfy Apple's ordinary account-deletion requirement.

## Execution ledger

Agent-executed affected-flow QA on an isolated iPhone 17 Pro simulator, iOS 26.5, with Expo Go SDK 57. Physical iPhone acceptance belongs to Leon; his connected iPhones are unavailable. Source: branch `codex/hafa-homes-ios-pause-20261010` based on `bdd070c`. Update this ledger with tested commit/build and release evidence.

| Case | Starting condition, action, expected outcome | Required | Result |
|---|---|---|---|
| N01 | Cold launch against production paused CDN: notice appears, no sign-in or API initialization | yes | not_run |
| N02 | Check for updates twice: finite check returns to pause, no backend call | yes | not_run |
| N03 | Open privacy and return: static privacy loads, pause and retry remain usable | yes | not_run |
| N04 | Support without mail app: address remains visible and recovery alert gives address; no email sent | yes | not_run |
| N05 | Background and foreground: status rechecks and pause remains; API stays blocked | yes | not_run |
| N06 | Isolated invalid/stalled status: unavailable appears within bounded timeout, retry recovers to pause | yes | not_run |
| N07 | Isolated available fixture: original runtime mounts; pause transition blocks further API; brief available recheck preserves runtime; confirmed pause/unavailable closes open native modals | yes | not_run |
| N08 | Signed production archive: correct bundle/version/build, entitlements, integrity, canonical CDN status | yes | not_run |
| N09 | Upload exact archive: Apple processing valid and internal testers can install | yes | not_run |
| N10 | Physical iPhone and public-review readiness: accepted device matrix and working deletion intake | public only | blocked |

## Engineering and resources

Mobile: 38 tests and TypeScript pass. Expo Doctor 21/21 and production audit policy passed before the development-only fixture override; rerun final checks. Existing exact build-tool advisory exceptions expire October 24, 2026; raw audit still reports inherited findings. Web/API final gate pending.

Lifecycle session `01a122e1-c936-7343-961a-3d8081ddfc40`. Own simulator `34439A73-584E-461D-A5C2-5C3F02FE88D4`, Metro PID `72480` on port 39093, and App Store Connect browser tab `2:4`. All baseline servers, containers, and simulators are borrowed. A simulator launch initially stalled before app execution; restart only this owned simulator. Clean the task delta after QA/release, retaining signed delivery artifacts.
