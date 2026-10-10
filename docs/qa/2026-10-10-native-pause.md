# Hafa Homes native pause release

## Context and acceptance

Leon requested a signed iOS update for TestFlight and, if eligible, public App Review. Hafa Homes is Shimizu Technology's Guam home-search and brokerage CRM demonstration platform; it has no authorized MLS production feed. The October 10 website release at `bdd070c4d0b0543715edd802ed34ba465aba6564` publishes a static paused status. Render is suspended and Neon compute is idle to avoid unused hosting charges. The installed iOS versions do not understand this status.

Sources: `docs/product/current-product-truth.md`, `docs/app-store-release.md`, `docs/qa/2026-10-10-pause.md`, and Leon's explicit release request. Scope: native availability gate, recovery, support/privacy access, signed delivery. Listings, CRM, authentication, deletion processing, and notification delivery require the paused backend and are excluded from live operational QA. No backend reactivation or hosting plan change is authorized by this release.

Required native acceptance: check the static CDN before auth/API initialization; show a clear pause notice; block API calls while paused or backgrounded; retry status without backend traffic; bound failed checks to five seconds; preserve the runtime across brief checks that return available and unmount it on confirmed pause/unavailability; keep privacy and support reachable. Production bundles must always use the canonical status URL. Internal TestFlight requires these checks, repository gates, reviewed source, signed archive verification, Apple processing, and tester availability. Public review additionally requires physical-iPhone acceptance and a functioning account-deletion initiation route; email support alone does not satisfy Apple's ordinary account-deletion requirement.

## Execution ledger

Agent executed N01–N07 on an isolated iPhone 17 Pro simulator, iOS 26.5, with Expo Go 57.0.9. Setup initially stalled; the first cached Expo Go 57.0.5 then lacked the current ExpoAsset module. Only the owned simulator was restarted and updated before acceptance execution. Physical iPhone acceptance belongs to Leon; his connected iPhones are unavailable. Source: branch `codex/hafa-homes-ios-pause-20261010` based on `bdd070c`. Tested implementation commit: `4f2a2e5f100c73f700298f495ebdf3ce34f3c857`. The signed production archive is verified; Apple processing and internal delivery are recorded below.

| Case | Starting condition, action, expected outcome | Required | Result |
|---|---|---|---|
| N01 | Cold launch against production paused CDN: notice appears, no sign-in or API initialization | yes | passed |
| N02 | Check for updates twice: finite check returns to pause, no backend call | yes | passed |
| N03 | Open privacy and return: static privacy loads, pause and retry remain usable | yes | passed |
| N04 | Support without mail app: address remains visible and recovery alert gives address; no email sent | yes | passed |
| N05 | Background and foreground: status rechecks and pause remains; API stays blocked | yes | passed |
| N06 | Isolated invalid/stalled status: unavailable appears within bounded timeout, retry recovers to pause | yes | passed |
| N07 | Isolated available fixture: original runtime mounts; pause transition blocks further API; brief available recheck preserves runtime; confirmed pause/unavailable closes open native modals | yes | passed |
| N08 | Signed production archive: correct bundle/version/build, entitlements, integrity, canonical CDN status | yes | passed |
| N09 | Upload exact archive: Apple processing valid and internal testers can install | yes | passed |
| N10 | Physical iPhone and public-review readiness: accepted device matrix and working deletion intake | public only | blocked |

## Engineering and resources

Final implementation gate: mobile 39 tests, TypeScript, Expo Doctor 21/21, and production audit policy pass. API 138 tests/1,517 assertions, autoload, Brakeman, dependency audit, and RuboCop pass. Web lint, 70 tests, build, and production dependency audit pass. GitHub CI API/web/mobile also passed for `4f2a2e5`. Existing exact build-tool advisory exceptions expire October 24, 2026; raw audit still reports inherited findings. CodeRabbit reviewed `4f2a2e5` and requested clarification of the previously pending QA ledger; this completed execution record addresses that finding. Independent final implementation review also covered `4f2a2e5` with no remaining material findings.

Lifecycle session `01a122e1-c936-7343-961a-3d8081ddfc40`. Own simulator `34439A73-584E-461D-A5C2-5C3F02FE88D4`, Metro PID `72480` on port 39093, and App Store Connect browser tab `2:4`. All baseline servers, containers, and simulators are borrowed. A simulator launch initially stalled before app execution; restart only this owned simulator. Clean the task delta after QA/release, retaining signed delivery artifacts.

## Native execution evidence

N01/N02: Cold production-CDN launch and two manual retries showed the pause notice, without authentication or the original runtime. N03: static privacy rendered in SFSafariViewController and Done returned to usable pause controls. N04: absent mail app showed the address in a recovery alert; no email was sent. N05: Home and Expo Go foregrounding rechecked status and returned to pause; fixture log recorded a new status GET and no API calls.

N06: isolated invalid and stalled responses showed unavailable; manual retry after fixture recovery returned to pause. Automated fake-clock coverage establishes the exact five-second timeout, including transports that ignore abort. The manual observation was taken after that deadline and establishes the visible recovery, not a precise wall-clock latency measurement.

N07: isolated available status mounted the original runtime against an owned HTTP fixture. A query and More screen persisted across foregrounding. A React Native showing-request modal containing `Isolated QA draft` also persisted during an available recheck. Changing the fixture to paused and foregrounding unmounted the modal, exposed privacy/support/retry, and produced no subsequent API requests. Available retry then mounted a fresh runtime with no stale dialog or draft. Fixture listing and automatic intent requests remained on loopback; no lead was submitted, no production record changed, and no provider message was sent. The fixture omitted Clerk and Mapbox intentionally, so this does not accept live auth/maps/backend workflows.

Screenshots retained outside Git: `Desktop/hafa-homes-ios-release-2026-10-10/native-pause.jpg` and `native-modal-paused.jpg`. Request log contains only status requests during paused/failed phases; original listing/intent calls occur only during available fixture phases. Production status remains paused throughout.

Signed build attempts 21 and 22 failed in CocoaPods because the installed JSON 3 gem rejects ActiveSupport 7.2's `quirks_mode` argument. A process-scoped Ruby preload selects the already installed JSON 2 gem; shared Ruby gems were not changed. Build 23 later reached Xcode archiving and stalled in SwiftBuild compiler-probe output capture; no IPA was uploaded from that attempt.

## Signed production delivery

- Merge/source: `a2375978e3e81df1b943b95dbc0685c98c10673a`, PR #42. Mobile tree matches the tested/reviewed implementation `4f2a2e5` exactly.
- Release: iOS `1.0.5 (25)`, bundle `com.shimizutechnology.hafahomes`, minimum iOS 17.0.
- EAS cloud build: `39d0b32a-2191-4e12-954b-e41652481634`, `FINISHED`.
- EAS submission: `485b3a36-7eeb-4dec-b64e-6c188304a902`, successfully uploaded.
- App Store Connect build: `4977073f-1af4-494e-8328-e98e1eec01ef`; processed and attached to existing internal `Team (Expo)` with one tester; its group build row explicitly shows `Testing`. Testing notes were saved directly in App Store Connect.
- IPA: 18,584,621 bytes; SHA-256 `bd9dd0149876b24130a1f75900b35c818572891cb1f8c0a55cdb634c320c867f`.
- Archive checks: ZIP integrity, version/bundle identity, and strict/deep code-signature verification passed. Signed entitlements contain native Apple sign-in, `applinks:hafahomes.com`, the expected Apple team, beta reports, and `get-task-allow=false`. The production Hermes bundle includes the canonical CDN status URL and excludes the loopback fixture.

Local attempt 24 reproduced the compiler-probe pipe stall despite regular-file output and serialized jobs. The exact standalone Clang probe worked immediately, confirming a local SwiftBuild capture problem. The October Expo Free allowance had 7 of 15 iOS builds used before this job; build 25 used the existing free allowance. No subscription or paid upgrade was added. EAS's automatic changelog feature required Enterprise, so it was omitted from submission and the notes were saved through the existing Apple account instead.

Public App Review and external beta review were not requested from Apple. N10 remains blocked: physical-iPhone acceptance is incomplete, and the paused app has email support rather than a functioning ordinary account-deletion initiation route. Apple's [account deletion requirements](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion) apply to existing accounts too. The public binary remains `1.0.3 (17)` and does not receive this pause screen. Store availability and existing public metadata were not changed.

After merge/upload, production static status still reports paused and the Render API returns HTTP 503. Native QA servers and the isolated database were removed, and the owned simulator was shut down and deleted. Borrowed resources were left unchanged. The owned Apple verification window is closed; the clean task worktree is removed after this delivery-record PR merges; signed artifacts, screenshots, and a structured release manifest remain in `Desktop/hafa-homes-ios-release-2026-10-10/`.
