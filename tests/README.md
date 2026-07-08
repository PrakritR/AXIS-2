# Axis Test Suite

## Quick start

```bash
cp .env.test.example .env.test
# Fill in dedicated Supabase test project credentials

npm run test:unit          # Fast pure-logic tests (no external deps)
npm run test:integration   # API route tests (needs .env.test or mocked)
npm run test:e2e           # Playwright browser tests (needs .env.test + running app)
npm run test:all           # All Vitest + Playwright
```

## Environment

Use a **dedicated Supabase test project** — never production credentials. See [`.env.test.example`](../.env.test.example).

For manager E2E signup, set `AXIS_PAYMENT_WAIVER_CODE=FREE100` to skip Stripe checkout.

For manager/resident/admin portal E2E tests, run `npm run test:seed` then set `E2E_TESTS_ENABLED=1` in `.env.test`.

## GitHub Actions secrets

Configure these in your repository settings for CI:

| Secret | Purpose |
|--------|---------|
| `TEST_SUPABASE_URL` | Test project URL |
| `TEST_SUPABASE_ANON_KEY` | Test anon key |
| `TEST_SUPABASE_SERVICE_ROLE_KEY` | Test service role key |
| `TEST_AXIS_ADMIN_REGISTER_KEY` | Admin bootstrap key |
| `TEST_AXIS_PAYMENT_WAIVER_CODE` | `FREE100` |
| `STRIPE_SECRET_KEY` | Stripe test mode key |
| `STRIPE_WEBHOOK_SECRET` | Stripe test webhook secret |
| `CRON_SECRET` | Cron route auth |

## Seed / cleanup

```bash
npm run test:seed
npm run test:cleanup -- <testRunId>
```

### Canonical demo portal accounts (`@test.axis.local`)

`npm run test:seed` provisions the sandbox accounts that mirror the idle `/demo` portfolio (from `src/lib/demo/demo-data.ts`):

| Role | Email | Password (default) |
|------|-------|---------------------|
| Admin | `admin@test.axis.local` | `TestAdmin123!` |
| Manager (demo portfolio) | `manager@test.axis.local` | `TestManager123!` |
| Manager (browse catalog) | `manager2@test.axis.local` | `TestManager123!` |
| Resident | `resident@test.axis.local` | `TestResident123!` |
| Vendor | `vendor@test.axis.local` | `TestVendor123!` |
| All portals | `testeverything@test.axis.local` | `TestEverything123!` |

- **Signed-in portal** (`/portal`, `/resident`, `/vendor`) reads and writes these rows in the test Supabase project.
- **`/demo`** loads the same data read-only via `/api/demo/portal-snapshot` (changes in demo stay in the browser; a refresh re-seeds from the mirror; portal edits persist to the DB and show up in demo — never the reverse).
- **`testeverything@`** holds every role (sign-in shows the portal picker) and is the guided "Run demo" tour's data source (`/api/demo/portal-snapshot?scope=guided`): its portal edits appear in the tour; an empty account = the tour's blank slate.
- Local `.env` should point at the **same test Supabase project** as `.env.test` so the demo mirror works on `localhost`.
- Re-run `npm run test:seed` after schema changes or when demo portfolio data drifts.
- Production gets the same accounts (minus `admin@` and `manager2@`) via the admin-gated `POST /api/admin/provision-sandbox-accounts` — same shared implementation (`src/lib/demo/canonical-demo-portfolio-db.ts`), run once per environment.

Browse-catalog E2E properties live on `manager2@test.axis.local` so they do not collide with the demo manager portfolio.
