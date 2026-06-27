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
pointing at the production project. It is wired into every server-side path that
opens a connection: the anon SSR client (`src/lib/supabase/server.ts`, reads),
the service-role client (`src/lib/supabase/service.ts`, privileged writes), the
password-verify helper (`src/lib/auth/verify-auth-password.ts`), and the OAuth
callback route (`src/app/auth/callback/route.ts`, which performs a real auth
exchange). So a misconfigured local env fails loudly instead of silently
touching production. The browser client cannot run this server-only check but
has no elevated access. `src/middleware.ts` is intentionally not guarded: it
only does a cookie-based `getSession` with no network round-trip, and importing
the `server-only` module into the middleware bundle is avoided.

> **The guard protects the app runtime only — not the Supabase CLI.** `db:push`,
> `db:pull`, and `db:baseline` act on whichever project is currently linked. A
> `supabase link` to production followed by `db:push` (or a hand-run `supabase db
> reset`) would mutate production. Always confirm the linked project (keep
> dev/test linked by default) before any push.

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

Both projects were originally built from the same migration files, so they
already share a schema — what they lack is the CLI **migration-history** table
that lets `db push` / `db diff` track state. Adopt the existing schema as the
baseline (non-destructive — nothing is dropped or re-run):

```bash
# 1. Confirm production matches the repo history (should add no migration)
supabase link --project-ref qahnczmilgptcedaqype
npm run db:pull                 # if it writes a migration, that is prod drift — commit it
npm run db:baseline            # mark all current migrations as applied on prod
npm run db:status              # all 35 show applied

# 2. Do the same on dev/test, then keep it linked as the default
npm run db:link:dev
npm run db:baseline
npm run db:status

# 3. (optional, needs Docker) prove there is no schema drift on dev/test
npm run db:diff                # expect: "No schema changes found"
```

> **`npm run db:reset` does not exist, by design.** `supabase db reset --linked`
> fails on managed Supabase — its teardown truncates `auth.*` / `storage.*`
> objects that the `postgres` role does not own (e.g.
> `auth.refresh_tokens_id_seq`), so it aborts with `must be owner of sequence …`.
> Reset is only for the local Docker DB. To adopt an already-applied schema use
> `db:baseline` (above). `db:diff` requires Docker to build its shadow database.

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

> Note: `supabase db push/diff/baseline` act on whichever project is currently
> **linked**. Keep dev/test linked by default; only link production for a
> deliberate deploy, and relink to dev/test immediately after.

## A note on MCP

There is no Supabase MCP server configured in this repo (only a Neon MCP). The
Supabase CLI is the source of truth for schema sync. A Supabase MCP could be
added later for convenience, but it would still rely on these migrations.
