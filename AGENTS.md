<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

This project is building Axis Housing. A platform for users that are property managers to manage their platform effectively.
Currently as we code there are two things to keep in mind for how we want to code. 
## Monitoring & Observability

We run two monitoring systems. Instrument both when adding or changing
relevant code — this is a build requirement, not optional cleanup.

**PostHog — product & site analytics (current).**

Coverage is layered. Lean on the lower (free) layers; only hand-write a named
event when an action is worth a funnel or conversion metric.

1. **Autocapture (automatic).** PostHog is initialized in
   `instrumentation-client.ts` with autocapture on, so every click, pageview,
   form submit, and frontend exception is already captured. Do NOT hand-roll a
   "user clicked X" event — it already exists. This covers new features the
   moment they ship, no code required.
2. **`data-attr` naming (one attribute).** Add `data-attr="kebab-name"` to any
   meaningful interactive element. Autocapture records it, so you can build a
   clean named Action in PostHog without a capture call. Use this for the long
   tail of buttons.
3. **Named events (one line)** for funnel/conversion moments — signup,
   listing_created, lease_signed, payment_initiated, etc.:
   - **Client intent** (fire on interaction): `track(event, props)` from
     `@/lib/analytics/track-client`, or the shared `Button`'s `event`/`eventProps`
     props (`<Button event="charge_created" eventProps={{ kind }}>`).
   - **Server-confirmed outcomes** (fire only after the route confirms success,
     never on click — the action can fail): `track(event, userId, props)` from
     `@/lib/analytics/posthog`. Add it next to the success `return`, like the
     existing `work_order_completed` / `message_sent` events.
   - Pair a client `*_started` with a server `*_completed`/`*_paid` to get a
     conversion funnel (e.g. `subscription_checkout_started` →
     `manager_subscription_purchased`).

Rules: `object_action` naming; **reuse existing event names** — grep
`src/lib/analytics` and existing `track(` call sites before inventing one; never
create parallel naming. **Never send PII or secrets as event properties** (ids
and enums only — no emails, names, addresses, free text).

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

## Performance & egress

We are on the Supabase free plan; egress is a real constraint. Prefer caching
over re-fetching. Public read routes should send CDN `Cache-Control` headers;
immutable Storage objects (unique filenames) should be cached long; client sync
loaders should reuse the shared TTL + in-flight guard pattern rather than
fetching unconditionally.

**Planned change (not yet done):** the portal calendar still polls
`/api/portal-schedule-records` (visibility-gated, 60s) to stay fresh. When
instant propagation becomes a product need or polling volume grows, replace the
poll with Supabase Realtime used as an invalidation signal (a DB trigger
broadcasts a tiny "changed" ping; the client refetches through the existing
scoped route, so app-layer scoping and RLS are unchanged). Full design and code
sketch: [`docs/realtime-schedule-invalidation.md`](docs/realtime-schedule-invalidation.md).

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

## Admin portal table tabs

Every internal staff admin tab (`/admin` routes) that renders a record table
follows one layout: sort/filter pills above a divider, table below it. Build
new admin tabs — and fix existing ones — with the shared primitives instead of
hand-rolled markup:

- `ManagerPortalPageShell` (`src/components/portal/portal-metrics.tsx`) renders
  title → `filterRow` slot → divider → `children`. Pass filters as `filterRow`
  (composing multiple filter groups with `ManagerPortalFilterRow`) so the
  divider lands below them and the table, passed as `children`, sits below
  that.
- `ManagerPortalStatusPills` for pill groups with counts;
  `PORTAL_TOOLBAR_GROUP` / `PORTAL_TOOLBAR_PILL_BUTTON` /
  `PORTAL_TOOLBAR_PILL_BUTTON_ACTIVE` for toggle groups without count badges.
- Table primitives in `src/components/portal/portal-data-table.tsx`
  (`PORTAL_DATA_TABLE_WRAP`, `PORTAL_DATA_TABLE_SCROLL`,
  `PORTAL_TABLE_HEAD_ROW`, `PORTAL_TABLE_TR_EXPANDABLE`, `PORTAL_TABLE_TD`,
  `PORTAL_TABLE_DETAIL_ROW`, `PORTAL_TABLE_DETAIL_CELL`,
  `createPortalRowExpandClick`) plus `MANAGER_TABLE_TH` from
  `portal-metrics.tsx`.

Feedback (`admin-bug-feedback-client.tsx`) and Inbox (`admin-inbox-client.tsx`)
are the reference implementations — copy their structure rather than
reinventing table/filter markup per tab.

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

# Vendor portal (Phase 1 foundation)

A 4th portal role — `vendor` — sits alongside manager/resident/admin. Phase 1
covers vendor login + portal shell + work-order visibility + notifications.
Phase 2 (bidding) and Phase 3 (Stripe Connect payouts) are documented below.

**Role plumbing.** `"vendor"` was added to `AuthRole`
(`src/lib/auth/portal-roles.ts`) and `PortalKind` (`src/lib/portal-types.ts`) —
two parallel enums, both needed. Every hardcoded role-literal guard across the
auth flow (`portal-access.ts`, `set-active-portal`, `resolve-oauth-portal-access.ts`,
`post-oauth-routing.ts`, `migrate-portal-user-id.ts`, `profile-role-row.ts`) was
extended in lockstep — when adding a 5th role, grep for `"resident" ===` /
`"manager" ===` literal chains rather than assuming one canonical `isAuthRole`.

**Portal registry.** `src/lib/portals/vendor.ts` defines 5 sections: Home
(`dashboard`), Services (section key stays `work-orders`, relabeled from "Work
Orders" as part of the mobile-nav-m1 overhaul), Calendar, Inbox, Profile.
Routes live at `src/app/vendor/layout.tsx` +
`src/app/vendor/[section]/[[...tab]]/page.tsx`, copied from the resident
portal shell. Render handlers are in `render-portal-section.tsx` under
`kind === "vendor"` blocks (after the resident blocks, before the generic
tabbed-workspace fallback). Native bottom bar primary set
(`NATIVE_BOTTOM_NAV_VENDOR_PRIMARY` in `src/lib/native/portal-bottom-nav.ts`)
is Services/Calendar/Inbox (3 tabs, no "More" tab) — Dashboard and Profile are
reached via the shared `PortalMobileNavBar` (back arrow + top-right profile
menu), which every portal's mobile/native layout renders now.

**Invite → signup linking.** A manager's "Send invite" (Vendors — reachable at
`/portal/services/vendors`, the `ManagerAllServicesPanel` component with
`tabId="vendors"`; no longer a standalone top-level nav section — that was
removed as redundant with the Services sub-tab)
writes a `vendor_invites` row (`manager_user_id`, `vendor_directory_id`,
`vendor_email`, status) — the invitee has no account yet, so this can't use the
`account_link_invites` Axis-ID-lookup shape; it's matched by lowercased email at
signup instead, mirroring how `manager_application_records` links residents.
`provision-vendor-account.ts` does the linking: on signup it looks up the
pending invite by email, links (or creates) the `manager_vendor_records` row,
sets its `vendor_user_id`, and marks the invite accepted. A vendor CAN also
self-serve signup from the public marketing CTA with no invite at all — they
just land with no linked manager until one exists.

**Row-level isolation.** `manager_vendor_records`, `portal_work_order_records`,
and `vendor_tax_profiles` all gained a `vendor_user_id` column (nullable,
populated once the vendor signs up) plus a `..._vendor_read` RLS SELECT policy
scoped to `vendor_user_id = auth.uid()` — defense in depth alongside the
existing service-role API routes, matching the `auth.uid()` pattern on the
financials tables. `/api/portal-work-orders` resolves `vendorId` (a
`manager_vendor_records.id` string) → `vendor_user_id` via
`resolveVendorUserId()` scoped to the work order's owning manager (never
trusting a client-supplied directory id from another landlord) at write time so
vendor GET requests can scope directly
by `.eq("vendor_user_id", user.id)`; vendor writes to that route are rejected
(vendor is read-only — the manager owns assignment/scheduling).

**Notifications.** Work-order-offer notification (Axis inbox message + email)
is NOT a separate new endpoint — it's wired into the EXISTING
`/api/portal/send-vendor-visit-email` route, which the manager UI already calls
whenever a visit is scheduled/rescheduled (`manager-work-orders-panel.tsx`).
That route now also calls `deliverPortalInboxMessage()` with
`toUserIds: [vendorUserId]` (resolved from the vendor's directory row) whenever
the vendor has signed up; the email always sends via the vendor's stored email
regardless of signup status. Phase 2 (tour → bid) should hook the same
`deliverPortalInboxMessage` call rather than growing a second notification path.
Inbox scoping added a 3rd scope constant (`axis_portal_inbox_vendor_v1`,
mirrored across `portal-inbox-delivery.ts`, `portal-inbox-thread-scope.ts`, and
the legacy duplicate in `send-inbox-message/route.ts` — yes, the scope-for-role
logic is duplicated 3x pre-existing, not something introduced here). Manager →
vendor and vendor → manager messaging permission checks were added to
`src/lib/inbox-recipient-scope.ts` (`vendorEmailsForManagers`,
`managerIdsOwningVendor` / `isVendorRole` branches) — without these the
automatic notification would silently get filtered out by
`filterRecipientsBySenderScope`.

**Vendor self-service tax profile.** The manager-facing
`/api/vendors/[id]/tax-profile` route requires manager auth
(`assertManagerFinancialsAccess`) and can't be reused by the vendor directly.
A separate `/api/vendor/tax-profile` route lets the signed-in vendor read/write
their OWN `vendor_tax_profiles` row, resolving `(manager_user_id, vendor_id)`
server-side from their own `manager_vendor_records.vendor_user_id` link — never
trusting client input for those two key fields.

# Vendor portal (Phase 2: tour → bid pricing)

Bidding lives in a new `work_order_bids` table
(`supabase/migrations/20260704130000_work_order_bids.sql`), not in
`portal_work_order_records.row_data` — the work order row only carries a
lightweight `biddingOpen` / `biddingOpenedAt` / `biddingResolvedAt` flag
(`DemoManagerWorkOrderRow` fields) plus the existing `vendorId` /
`vendorName` / `cost` fields that already model final vendor assignment.

**Single-vendor-at-a-time offer, not a multi-vendor auction.** The work
order's existing `vendorId` (`manager_vendor_records.id`) / `vendor_user_id`
column can only point at one vendor, and `/api/portal-work-orders` GET scopes
a vendor's visibility to `vendor_user_id = auth.uid()` — so only the currently
assigned vendor can see and bid on a given work order at a time. The
`work_order_bids` table itself does **not** preclude multiple bids per work
order (only `unique(work_order_id, vendor_user_id)`): a manager can reassign
`vendorId` to a different vendor and click "Invite for bids" again, and each
vendor's bid is tracked as its own row. The tradeoff: if a manager moves on to
vendor B, vendor A loses read access to that work order (and its own status
badge) even though their `work_order_bids` row still exists — acceptable for
Phase 2 per spec, revisit if concurrent multi-vendor bidding becomes a
requirement.

**Flow.** Manager assigns a vendor (existing `assignVendor`), optionally
schedules a tour visit (existing flow, unchanged), then clicks "Invite for
bids" (`manager-work-orders-panel.tsx`) — this sets `biddingOpen: true` on the
work order (mirrored to the server via the existing local-first
`updateManagerWorkOrder` → `/api/portal-work-orders` "replace" sync, same as
every other work-order field) and calls `/api/portal/send-vendor-visit-email`
with `kind: "bid_offer"` to reuse the SAME vendor resolution + email (Resend)
+ `deliverPortalInboxMessage` + audit-log pipeline as the visit-scheduled
email, just with different copy (`buildVendorBidOfferEmail` in
`src/lib/vendor-visit-email.ts`) — no second notification path was built. The
vendor submits/updates a cost + proposed-time + note bid via the new
`/api/portal/work-order-bids` route (`vendor-work-orders-panel.tsx`), which
verifies `portal_work_order_records.vendor_user_id === auth.uid()` AND
`row_data.biddingOpen === true` before accepting a write — never trusting a
client-supplied work order id to attach a bid to an unrelated manager's
record. The manager reviews bids on the work-order detail and accepts one;
the accept route (server-side, service-role) sets that bid `accepted`, every
other `submitted` bid on the same work order `declined`, patches the work
order's `row_data` directly (`vendorId`, `vendorName`, `cost`, `biddingOpen:
false`) bypassing the client mirror (the manager's browser picks it up on its
next `syncManagerWorkOrdersFromServer`), and notifies the winner (and,
best-effort, each declined vendor) via `deliverPortalInboxMessage`.

**RLS** (`work_order_bids_vendor_owner` / `work_order_bids_manager_read`)
follows the `vendor_tax_profiles_owner` / `..._vendor_read` split from Phase
1: vendor is `FOR ALL` owner of their own bid rows (`vendor_user_id =
auth.uid()`), manager gets `FOR SELECT` only (`manager_user_id = auth.uid()`,
denormalized onto the bid row at submit time so no join is needed) —
defense-in-depth only, since real writes go through the service-role API
exactly like every other portal table in this codebase.

# Vendor portal (Phase 3: Stripe Connect payouts + invoices)

**Connect account reuses the manager's column.** `profiles.stripe_connect_account_id`
(added for managers in `20250421120000_profiles_stripe_connect_account.sql`) is generic —
keyed by `userId` only — so it's reused as-is for a vendor's own Connect Express account
rather than adding a new column; a vendor and a manager are always different auth users, so
there's no collision risk. `ensureVendorConnectAccountId` (`src/lib/stripe-connect-account.ts`)
is a thin wrapper over the existing `ensureManagerConnectAccountId`, passing
`axisPortal: "vendor"` so the Stripe account's `metadata.axis_portal` distinguishes vendor
from manager accounts in the Stripe Dashboard.

**Vendor-specific onboarding routes.** `/api/vendor/stripe-connect/{onboard,status}` are
clones of the manager `/api/stripe/connect/{onboard,status}` routes (not a generalized single
route) because the manager routes hardcode `basePath = "/portal"` for the Account Link
return/refresh URLs; the vendor routes hardcode `/vendor/profile` instead and additionally
gate on `profiles.role === "vendor"`. The shared `PortalStripeConnectPanel` component
(`src/components/portal/portal-stripe-connect-panel.tsx`) gained optional `apiBase`,
`returnPath`, and `dataAttrPrefix` props (all defaulting to the original manager behavior) so
it could be reused for the vendor Settings → Payments panel (`variant="embedded"`, previously
unused) instead of forking the whole component.

**Demo-mode mock.** `PortalStripeConnectPanel` now short-circuits in `isDemoModeActive()`:
`loadStatus` returns a canned "already connected" `ConnectStatus` instead of leaving status
`null`, and `startConnect` shows a toast instead of opening a real Stripe popup/fetch — this
also incidentally fixes the same latent gap on the manager's demo Payments page (clicking
"Link"/"Update" there previously hit the real (unauthenticated, in `/demo`) API and 401'd).

**Payouts are best-effort, never block the bookkeeping flow.** `payoutVendorForWorkOrder`
(`src/lib/stripe-vendor-payout.ts`) is called from `/api/portal/work-orders/approve-pay` right
after the existing bookkeeping-only `markWorkOrderPaid` write. It attempts a
`stripe.transfers.create` (destination = the vendor's Connect account, amount = the work
order's `vendorCostCents` labor cost — materials are not transferred, they're the manager's
own expense) and always writes exactly one `vendor_payouts` row per work order (`status:
"paid"` with the transfer id, or `"failed"` with a human-readable reason for any error: no
Connect account, incomplete onboarding, Stripe not configured, insufficient platform balance,
etc.). It never throws — approve-pay's manager-facing "Approved and paid." always succeeds
regardless of payout outcome, and a failed payout is surfaced to the vendor (with a link back
to Settings) rather than to the manager.

**Invoices/work history reuse the existing Completed tab.** No new top-level portal section
was added; `vendor-work-orders-panel.tsx`'s Completed tab renders an "Invoice" block per row
(labor + materials from the work order's own `vendorCostCents`/`materialsCostCents`, the same
fields `approve-pay` already logs as expenses) plus the matching `vendor_payouts` row's status,
fetched via `GET /api/vendor/payouts` (vendor's own rows only, no join — the client already has
full work-order context from `readVendorWorkOrderRows()`).

**An accepted bid's `amount_cents` is the immutable payout anchor — nothing may overwrite it
after acceptance.** `approve-pay`/`payoutVendorForWorkOrder` trust `work_order_bids.amount_cents`
of the `accepted` bid as ground truth for the real Stripe transfer, precisely so a forged
request body can't inflate a payout. `/api/portal/work-orders/set-vendor-price` (the vendor's
own pre-"mark done" price-entry route) must check the bid's status *before* writing anything and
return 409 if it's already `"accepted"` — do not let it fall through to updating
`work_order_bids` or `portal_work_order_records.row_data.vendorCostCents` in that case. It may
still set a price when there's no bid, or the bid is merely `"submitted"` (not yet accepted). A
regression here shipped after the fix commits (`e07b70c`, `eac1439`) added this exact anchoring
invariant — see `tests/integration/portal/set-vendor-price.test.ts` for the guarding tests.
