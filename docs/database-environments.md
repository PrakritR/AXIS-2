# Database environments

Axis uses **two Supabase projects** and keeps their schemas identical with the
Supabase CLI. Which project you touch is decided entirely by which env file is
loaded — the app code never switches databases by itself.

## The two projects

| Environment | Used by | Supabase project | Credentials come from |
|---|---|---|---|
| **Dev + Test** | local `npm run dev`, `vitest`, Playwright | `emstjswhotsnyksqhqyf` | `.env` (local dev) and `.env.test` (tests) |
| **Production** | the deployed site (axis-2.vercel.app) | `qahnczmilgptcedaqype` | **Vercel env vars only** |

Rules:

- **Local development and the automated tests share the dev/test project.** Tests
  namespace their rows by `testRunId` and clean them up
  (`tests/helpers/seed-test-db.mjs` / `cleanup-test-db.mjs`), so they coexist
  with manual dev data.
- **Production credentials never live in a local file.** They are set in the
  Vercel Production scope only. A local `.env` must point at the dev/test
  project.

### Fail-closed guard

`assertNonProdDatabase()` in `src/lib/server-env.ts` throws if a non-production
runtime (local dev, tests, Vercel preview) has `NEXT_PUBLIC_SUPABASE_URL`
pointing at the production project. It is wired into both server-side client
factories — the anon SSR client (`src/lib/supabase/server.ts`, the read path)
and the service-role client (`src/lib/supabase/service.ts`, privileged writes) —
so a misconfigured local env fails loudly instead of silently touching
production. The browser client cannot run this server-only check, but it has no
elevated access.

The production project ref is supplied out-of-band via the optional
`AXIS_PROD_SUPABASE_REF` env var (so the ref is not hardcoded in source). Set it
to `qahnczmilgptcedaqype` in your local `.env`/`.env.test` and in Vercel. When
unset the guard is a no-op.

## Local setup

1. Copy `.env.example` → `.env` (or `.env.local`) and fill the Supabase block
   with the **dev/test** project values (`Project Settings → API` of
   `emstjswhotsnyksqhqyf`). Set `AXIS_PROD_SUPABASE_REF=qahnczmilgptcedaqype`.
2. `.env.test` already targets the dev/test project — leave it.
3. Run `npm run dev`. Create an account; the row lands in the dev/test project,
   never in production.

## Schema workflow (Supabase CLI)

The 35 files in `supabase/migrations/` are the versioned schema history. Apply
the same migrations to both projects so they stay identical.

One-time login + link to the dev/test project (the default working DB):

```bash
supabase login                 # opens browser, stores an access token
npm run db:link:dev            # links emstjswhotsnyksqhqyf (prompts for DB password)
```

Day-to-day:

```bash
npm run db:new add_some_table  # create a new timestamped migration file
# ...edit the generated SQL...
npm run db:diff                # show schema drift vs the linked (dev/test) project
npm run db:push                # apply pending migrations to dev/test
# run the app + tests against dev/test
```

### Baseline / mirror the dev/test project from production

Run once so the dev/test schema reflects production's *actual* current schema
(including any drift from past manual SQL-Editor edits):

```bash
supabase link --project-ref qahnczmilgptcedaqype   # link production
npm run db:pull                                     # capture prod schema into a new migration
# review the generated migration — it reveals any drift vs the repo history
npm run db:link:dev                                 # relink to dev/test
npm run db:reset                                    # drop + re-apply all migrations to dev/test
npm run test:seed                                   # repopulate dev/test accounts
npm run admin:ensure-demo-manager
```

`npm run db:diff` should then report **no** differences.

### Deploying a schema change to production

Migrations are pushed to production deliberately, as a separate step:

```bash
supabase link --project-ref qahnczmilgptcedaqype   # link production
npm run db:diff                                     # confirm what will change
npm run db:push                                     # apply to production
npm run db:link:dev                                 # ALWAYS relink back to dev/test
```

Because the same migration files are pushed to both projects, the schemas stay
mirrored.

> Note: `supabase db push/diff/reset` act on whichever project is currently
> **linked**. Keep dev/test linked by default; only link production for a
> deliberate deploy, and relink to dev/test immediately after.

## A note on MCP

There is no Supabase MCP server configured in this repo (only a Neon MCP). The
Supabase CLI is the source of truth for schema sync. A Supabase MCP could be
added later for convenience, but it would still rely on these migrations.
