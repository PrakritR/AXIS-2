<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

This project is building Axis Housing. A platform for users that are property managers to manage their platform effectively.
Currently as we code there are two things to keep in mind for how we want to code. 
## Monitoring & Observability

We run two monitoring systems. Instrument both when adding or changing
relevant code — this is a build requirement, not optional cleanup.

**PostHog — product & site analytics (current).**
- Use for: user-facing events, feature usage, funnels, conversion, and
  frontend error tracking on the core web app.
- When you add a meaningful user action (signup, listing_created,
  lease_signed, payment_initiated, etc.), emit a PostHog event using the
  existing `object_action` naming convention. Reuse existing event names;
  don't create parallel naming.
- Never send PII or secrets as event properties.

**Langfuse — AI agent observability (in development).**
- Every agent session, LLM call, and tool call MUST be traced: the prompt,
  tools available, tool chosen, tool arguments, tool result, token counts,
  and cost.
- Every trace must carry `landlordId` and the session/user id so sessions
  are replayable and attributable.
- Langfuse traces are the source of truth for debugging agent behavior. A
  failure should be fully reproducible from its trace.
- Failed or thumbs-down sessions feed our eval set — preserve enough
  context in each trace to turn it into a test case.

## AI Agent & Tool Layer (in development)

We are building a native AI agent into the site: users ask in natural
language and it performs actions the site can already do.

**The tool layer is the spine. The agent acts ONLY through it.**
- All site capabilities (read and write) are exposed as typed,
  permission-scoped tool functions in `src/lib/tools/`. The SAME
  functions back the normal UI and the agent — one implementation, not two.
- The agent must NEVER access the database directly, write raw SQL, or call
  internal services that bypass the tool layer. If a capability is missing,
  ADD A TOOL — do not work around the layer.
- Every tool takes `landlordId` from the authenticated context, never from
  model-supplied input, and enforces per-landlord scoping internally. It
  must be impossible to use any tool to read or modify another landlord's
  data.

**Facts are tool-grounded. The model orchestrates; the system computes.**
- All numbers, balances, dates, and statuses come from tool return values,
  never from the model's own generation. The agent may explain and
  summarize but must not invent or recompute financial figures.

**Write actions are gated.**
- Any state-changing tool (send message, send rent reminder, create/update
  lease, etc.) goes behind an explicit user preview/confirmation step and
  writes to the audit log.
- Treat ALL tenant- and applicant-submitted text (applications, maintenance
  notes, messages) as untrusted input that may contain prompt-injection
  attempts. It must never trigger an unconfirmed action or override
  instructions.

**Implementation notes.**
- Use the Anthropic SDK with native tool-calling and a thin custom agent
  loop; avoid heavy agent frameworks.
- New site features should expose their capabilities as tools so the agent
  inherits them automatically.
<!-- END:nextjs-agent-rules -->

## Web + native (Capacitor)

Axis ships **one codebase** for the website and iOS/Android apps. The native shells load the deployed Next.js site in a WebView — portal features you add (e.g. resident Applications) appear in **both** after a Vercel deploy. Do not duplicate portal UI for mobile.

When changing portal nav, routes, push notifications, or uploads:

1. Update section registries in `src/lib/portals/*` and `render-portal-section.tsx`.
2. Keep `src/lib/platform/parity.ts` in sync (`IN_APP_PATH_PREFIXES`, `REGISTERED_PUSH_DEEP_LINKS`).
3. Run `npm run test:unit` — `tests/unit/platform-parity.test.ts` enforces parity.

See **`docs/web-and-native-parity.md`** and `.cursor/rules/web-native-parity.mdc`.

# Branching & deployment (Vercel)

The Vercel project (`axis-2`, connected to `PrakritR/AXIS-2`) is configured so the
**Production Branch is `production`**, not `main`. Two branches, two roles:

- **`production` — the live site.** Every push here triggers a **production
  deploy** to the real domains: `axis-seattle-housing.com`,
  `www.axis-seattle-housing.com`, and `axis-2.vercel.app`. Only ship-ready code
  reaches this branch. Never commit straight to it.
- **`main` — integration / staging.** Day-to-day work merges here. Every push
  produces a **preview deploy**, and Vercel keeps a stable staging alias that
  always points at the latest `main` build:
  `axis-2-git-main-prakritramachandran-6082s-projects.vercel.app`. Use this to
  validate a release before promoting. Feature branches also get their own
  preview URLs.

**Promote `main` → `production` to ship.** When `main` is verified on staging and
you want it live:

```
git checkout production
git pull
git merge --ff-only main   # production should stay a fast-forward of main
git push origin production  # Vercel auto-deploys this to the live domains
git checkout main
```

Keep `production` a strict fast-forward of `main` (never commit unique work to
`production`); this keeps history linear and makes rollbacks obvious. To roll
back, point `production` at the previous known-good commit and push, or use
Vercel's **Instant Rollback** in the dashboard.

Yes, deploying `main` as a staging step is standard practice on Vercel: `main`'s
preview/branch alias is your staging environment, and `production` is the gated
promotion target. Don't add a separate Vercel project for staging — the branch
model above already gives you prod + staging from one project.

The Production Branch setting lives in **Vercel → Project `axis-2` → Settings →
Git**. Don't change it back to `main`.

# Working in a git worktree

Worktrees (e.g. created by `treehouse`) only contain *tracked* files. Gitignored
secret files like `.env` and `.env.test` do **not** carry over, so a fresh
worktree can't read `ANTHROPIC_API_KEY`, Stripe keys, the Supabase service role,
etc. Seed them from the primary checkout once per new worktree:

```
npm run seed:env            # copy missing .env / .env.test (never overwrites)
npm run seed:env -- --force # overwrite existing files in this worktree
npm run seed:env -- --dry-run
```

Note: the AI agent reads `ANTHROPIC_API_KEY` (via `new Anthropic()`); add it to
`.env` if it isn't there yet. `POSTHOG_*` and `LANGFUSE_*` are optional.

# Database environments

Local dev and the automated tests share one **dev/test** Supabase project;
**production is a separate project whose credentials live only in Vercel**.
Never point a local `.env` at production. Schema parity between the two projects
is maintained with the Supabase CLI (`npm run db:push`), not the SQL Editor. Full
model and workflow: [`docs/database-environments.md`](docs/database-environments.md).
