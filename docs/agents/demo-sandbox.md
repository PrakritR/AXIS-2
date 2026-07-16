> Moved out of AGENTS.md to keep every-session context lean. This file is the
> source of truth for its area — READ IT BEFORE changing code in this area.

# Sandbox accounts & the /demo mirror (one config, every environment)

**The canonical `@test.axis.local` accounts are the demo's data source, and the
data flow is strictly one-way: signed-in portal edits → DB → `/demo`. Never the
reverse.** `/demo` renders from browser-local stores seeded on every mount from
`GET /api/demo/portal-snapshot` (service-role read of `manager@`/`resident@`/
`vendor@test.axis.local`, ids remapped to synthetic `demo-*` scopes, per-empty-
collection static fallback) — so demo edits live in sessionStorage and are wiped
by refresh. Every server-mirror write path is `isDemoModeActive()`-gated; the
work-orders panel's direct fetches (approve-pay / complete / auto-schedule /
bid-accept / vendor email) got explicit demo short-circuits — a signed-in user
browsing `/demo` must never write real rows. Keep that gate pattern for any new
panel action that fetches an authed route.

**The guided "Run demo" tour seeds from the static idle dataset, not an
account mirror.** `prepareDemoSegment` (`src/lib/demo/demo-segment-prep.ts`)
seeds EVERY segment — including `overall` — from `buildDemoIdleSnapshot()`, so
the tour, the interactive idle demo, and the post-tour state all show one
consistent dataset; segments that need a listed property create one
programmatically on top. Both tour endings (natural finish and the Exit
button) land on the same state: the guided scope flips back to the idle scope
and the idle snapshot is re-seeded, so panels never read stale guided-scope
rows. The tour no longer mirrors `testeverything@test.axis.local` portal data
(the old `?scope=guided` account-mirror model). That account still holds all
four roles (manager primary; sign-in shows the portal picker) and stays
editable signed-in like any account. Display names for the canonical
resident/vendor are the neutral "Test Resident"/"Test Vendor"
(`demo-canonical-accounts.ts` — the seed `tests/helpers/seed-test-db.mjs`
duplicates them as plain literals; keep in sync).

**Provisioning is per-environment, one implementation.** The portfolio writer
lives in `src/lib/demo/canonical-demo-portfolio-db.ts`, shared by the test-DB
seed CLI (`tests/helpers/seed-canonical-demo-portfolio.ts`, spawned from
`seed-test-db.mjs`) and the admin-gated `POST /api/admin/provision-sandbox-
accounts` (accounts + roles + pro tier + portfolio; `{"seedPortfolio":false}`
for accounts only; idempotent, never deletes). Dev/test: `npm run test:seed`
(also PRUNES non-canonical accounts — including any personal Gmail — by
design). Production: run the route once as the production admin after deploy;
credentials never leave the environment. `admin@test.axis.local` is deliberately
NOT provisioned by the route — never auto-create an admin-role account with a
well-known password in production. Signups always land in whatever DB the
deployment's env points at (`assertNonProdDatabase` guards the cross-wiring).
In-app account deletion (`POST /api/account/delete`, all portals) refuses
`@test.axis.local` accounts — deleting one would brick `/demo` and the tour.
