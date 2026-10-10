# Hafa Homes pause and resume

Leon authorized a temporary Hafa Homes pause on October 10, 2026. Keep the static website and support information available while suspending the Rails service. Retain Neon data and object storage. The separate Payroll and Marianas Open services remain unchanged.

## How the website pauses

`web/public/service-status.json` contains `{ "state": "paused" }`. The entry point checks this static CDN file before loading the application, authentication, analytics, or brokerage context. Every app route displays the temporary pause notice, except `/privacy`, which retains the existing policy and adds a support path. The page does not poll the API. Invalid/missing status fails closed with a finite retry state; the status check times out after five seconds.

The status file bypasses the service-worker cache and uses `no-store` headers. Service-worker shell version 2 clears the older shell cache. Existing tabs running older JavaScript may continue attempting requests until reloaded; a suspended API cannot process those requests.

The currently public native iOS build `1.0.3 (17)` and internal `1.0.4 (20)` do not read this status file and have no Expo OTA configuration. Their existing connection-error behavior remains after API suspension. A new reviewed mobile build is required to display the same pause screen natively; this change does not claim to ship one. Support and account-deletion requests during the pause go to `shimizutechnology@gmail.com` through the website. Resume the API temporarily if needed to fulfill a verified request; follow the ordinary deletion workflow and preserve the user's authorization.

## Pause order

1. Pass the repository engineering gate, review the final PR, and verify the web pause and privacy routes on desktop and a phone viewport. Keep Apple association files, redirects, and the static support page available.
2. Publish the reviewed web commit to Netlify `hafahomes` at `https://hafahomes.com`. Verify `/service-status.json` says `paused`, the homepage and a direct listing/admin URL show the notice, `/privacy` shows the existing policy, and no application API request starts.
3. Check outstanding notification/deletion work with a read-only production query. Stop if durable external work is incomplete. Do not cancel or discard jobs to make the check pass.
4. Suspend only Render `hafa-homes`, service `srv-d85h4kuk1jcs73flvr80`. Confirm its dashboard reports suspended. Do not delete the service or database and do not touch other services.
5. After Neon's idle interval, verify production compute is idle. Console SQL wakes it; use monitoring rather than repeatedly querying it. Preserve Launch scale-to-zero and retained storage.
6. Record deployed web source, suspension time, Neon state, and remaining mobile limitations in the QA ledger.

## Resume order

1. Resume the same Render service while keeping the static status `paused`. Verify the service has booted on the intended commit, `/up` passes, database access works, and reconciliation jobs recover pending durable work. Check production auth/tenant settings; do not replace them with local fixtures.
2. Test listing search, sign-in/saved homes, a controlled showing/contact request, and required notification/deletion recovery using owned fixtures and approved delivery destinations. Preserve submitted leads and brokerage scope.
3. Change `web/public/service-status.json` to `{ "state": "available" }` in an isolated branch, pass checks/review, and publish. Confirm the website mounts the normal app and the native client can reach the API.
4. Verify actual production availability and resource use before treating the product as resumed.

## Cost interpretation

Suspending Render avoids its $7 monthly compute price while suspended. October 10 Neon observations suggest roughly $34.5/month of additional compute at the earlier pace, making about $40–42/month a conditional opportunity. Retained storage and later resume intervals remain billable. Confirm savings from subsequent provider usage and invoices; the estimate is not a guaranteed invoice reduction.
