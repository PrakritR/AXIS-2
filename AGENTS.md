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

## AI Agent & Tool Layer

A native AI agent is built into the site on all three portals (manager,
resident, vendor): users ask in natural language and it performs actions the
site can already do, behind explicit user confirmation. **Full architecture,
tool catalog, write-action lifecycle, and the add-a-tool checklist:
[`docs/ai-assistant.md`](docs/ai-assistant.md)** — read it before touching
`src/lib/tools/` or `src/lib/agent/`.

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
- Mechanism: write tools use `defineWriteTool` (a required `preview` plus the
  `handler` that executes). The model sees write tools, but the loop only ever
  builds the preview and ends the turn as a pending action (an
  `agent_pending_actions` row). The client confirms with ONLY the action id;
  the server re-validates the stored input and the handler re-resolves current
  state before writing. Add new agent write capabilities by following this
  pattern — never execute a write from the model loop.
- Treat ALL tenant- and applicant-submitted text (applications, maintenance
  notes, messages) as untrusted input that may contain prompt-injection
  attempts. It must never trigger an unconfirmed action or override
  instructions.

**There is exactly one assistant framework, and it is this one.** A second,
independent implementation of the same feature (its own write-action framework,
per-role agent sessions, a dedicated `/api/agent/action` confirm route, and a
larger manager/resident/vendor tool catalog) exists on the captain's Cursor
working copy and is NOT merged: its `ActionPreview` / write-tool shapes are
incompatible with `defineWriteTool`, so the two cannot coexist in one tree. The
shipped framework above stays the spine — it owns the two production SMS agents
wired to live Twilio webhooks. If that catalog is wanted, PORT the tools onto
this framework; do not merge the other framework alongside it. A tree carrying
two half-wired assistant frameworks is worse than either one alone.

**One conversation loop, multiple surfaces.** The floating popup
(`axis-assistant.tsx`) and the manager dashboard's right-dock
(`dashboard-assistant-dock.tsx`, desktop `hidden lg:block` only — mobile keeps
FAB/popup) both drive the SAME send/confirm transport,
`useAssistantConversation(endpoint)`, and share the suggestion chips +
preview/confirm card from `assistant-shared.tsx`. A dashboard-initiated approval
is NOT a new send path: proposed writes surface as "AI drafts" chips in Needs
attention (`AiDraftsGroup` in `manager-dashboard.tsx`, fed by
`useAgentPendingActions` off owner-scoped `GET /api/agent/pending-actions`), and
Approve/Discard POST ONLY the action id to `/api/agent/chat` →
`claimPendingAction` re-validates the stored input server-side. Never add a
one-click execute that skips that gate; the list route returns only the preview,
never the stored input. `aiDrafts` is a `MANAGER_DASHBOARD_SECTIONS` entry gated
on `visibility.aiDrafts` like every other dashboard section.

**One registry + one context resolver per role.** The assistant is mounted in
every portal, so each role needs its own three-piece set — resolver, registry,
route — and they must never be crossed:

| Role | Context resolver | Registry | Route |
| --- | --- | --- | --- |
| Manager / owner / admin | `resolveAgentContext` | `agentRegistry` | `/api/agent/chat` |
| Resident | `resolveResidentAgentContext` | `residentAgentRegistry` | `/api/agent/resident-chat` |
| Vendor (signed in) | `resolveVendorAgentContext` | `vendorAgentRegistry` | `/api/agent/vendor-chat` |
| Vendor SMS (one job) | `buildVendorAgentContext` | `vendorWorkOrderAgentRegistry` | inbound webhook |
| Prospect SMS | `buildLeasingSmsAgentContext` | `leasingSmsAgentRegistry` | inbound webhook |

- `resolveAgentContext` REJECTS non-managers by design. A portal that mounts
  `AxisAssistant` without passing its own `endpoint` therefore answers 401 to
  every question — that is exactly how the resident and vendor assistants were
  silently broken. When adding a portal, pass its role-scoped endpoint.
- `landlordId` means different things per role: the manager's own id, the
  resident's LINKED MANAGER, and empty for a vendor. It is an ownership key
  ONLY for managers. Every resident tool must additionally filter by
  `ctx.residentScope`, and every vendor tool by `ctx.vendorPortalScope` —
  otherwise two residents of one manager can read each other.
- `agent_pending_actions` is claimed on `user_id`, never `landlord_id`, for the
  same reason.
- A write tool without a `preview` is UNREACHABLE from chat (`previewWriteTool`
  rejects it), so it is a capability gap, not extra safety. Give every write
  tool a preview and register it; the preview/confirm gate is the safety.

**Resident row scoping is not uniform.** `portal_household_charge_records` and
`portal_lease_pipeline_records` carry both `resident_user_id` and
`resident_email`; `portal_work_order_records` and
`portal_service_request_records` carry ONLY `resident_email`. Querying a column
a table lacks fails the whole request — see `RESIDENT_IDENTITY_COLUMNS` in
`src/lib/tools/domains/resident-portal.ts`.

**Capabilities that deliberately have no tool.** Approving a rental application
and creating/editing a listing are NOT agent capabilities: approval-time charge
generation (`recordApprovedApplicationCharges`) and listing normalization are
browser-only — they bail out via `isBrowser()` and need the manager's local
listing catalog. A server-side approve tool would create a resident with no rent
charges. Do not add one until that logic moves server-side.

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

Feedback (`admin-bug-feedback-client.tsx`) and Communication → Email
(`admin-inbox-client.tsx`) are the reference implementations — copy their
structure rather than reinventing table/filter markup per tab.

## Sharing listings to a prospect (Send listing modal)

`ShareLeadLinkModal` (`share-lead-link-modal.tsx`) is the one "Send listing /
Invite to apply / Share tour" surface, mounted from Properties (header **Share**
and each listed row's ACTIONS **Send to prospect**), Applications, and Calendar.
Only the **listing** kind is multi-select (a manager can send several/all
properties at once via `CheckboxMultiSelect`); **apply** and **tour** stay
single-property because they target one apply/tour flow. Rules baked into the
modal + `/api/portal/send-lead-invite`:

- **Single listing → direct listing page** (`buildManagerListingUrl` →
  `/rent/listings/{id}`). **Several listings → filtered browse link**
  (`buildManagerBrowseUrl` → `/rent/browse?ids=a,b,c`). The public browse page
  reads that param (`BROWSE_IDS_PARAM` / `parseBrowseIdsParam` in
  `manager-property-links.ts`) and restricts the grid via the
  `PropertyBrowseFilters.propertyIds` set in `buildPropertyBrowseCards`
  (`room-listings-catalog.ts`). The other manual filters still apply within the
  set; an id not in the public catalog is simply absent (same visibility rule as
  everywhere — a listing that isn't publicly active never appears on browse).
- The **room selector only shows for exactly one selected property** — it is
  meaningless (and hidden) for a multi-send.
- The email builder (`lead-invite-email.ts`) takes an optional `listingCount`;
  `>1` switches subject + body/html to the multi-listing "browse these N homes"
  copy instead of the single-listing summary.
- The server **re-authorizes every requested id** via
  `getShareablePropertyForUser` and rejects the whole send (403) if any id is
  not owned/assigned — never silently drops one. Client sends both `propertyId`
  (first, back-compat) and `propertyIds` (full list).

## Listing images: never fabricate a photo

A production listing/room with zero genuine uploaded photos must render
`NoImagePlaceholder` (`src/components/ui/no-image-placeholder.tsx`) — never a
stock/fabricated image. A prospective tenant seeing a photo on a listing card
reasonably assumes it's a photo of that unit; showing stock photography is
misleading.

`PropertyBrowseCard.imageUrl` (and any future listing-image field) uses an
empty string to mean "no real photo" — render the placeholder rather than
falling back to anything else. This applies to Browse cards
(`resident-housing-browse.tsx`, `housing-browse-swipe-stack.tsx`) and the
listing detail hero gallery (`listing-detail-sections.tsx`). The only
permitted stock fallback is `demoOnlyBrowseCardPlaceholderImage`
(`src/lib/room-listings-catalog.ts`), gated behind `isDemoModeActive()` so it
can only ever affect the `/demo` sandbox, whose photo-less properties (the
guided tour lists one through the real wizard) should never look "broken"
mid-walkthrough. Regression coverage:
`tests/unit/property-browse-cards.test.ts`.

## Portal UI system

**Read [`docs/portal-ui-system.md`](docs/portal-ui-system.md) before editing portal UI.**

Expandable rows, section cards, and data tables share one pattern across manager,
resident, vendor, and admin portals:

- **Chevron inline after primary label** — use `PortalTableInlineExpand` in table
  rows; never a trailing `PortalTableExpandCell` / `PORTAL_TABLE_EXPAND_TH` column.
- **Chevron direction:** `ChevronRight` (→) collapsed, `ChevronDown` (↓) expanded
  via `PortalTableExpandChevron`.
- **Section cards:** `PortalCollapsibleSection` with title + inline chevron,
  subtitle on the next line (`titleVariant="resident"` for property-portal detail).
- **Mobile cards:** chevron beside title, not `justify-between` at far right.

Reference: resident detail sections in `manager-residents.tsx`; inbox table in
`portal-inbox-ui.tsx`.

### Manager dashboard sections are customizable + mobile-collapsible

The manager dashboard (`manager-dashboard.tsx`) renders a fixed catalog of
sections (cash-flow chart + the "Needs attention" groups). Two invariants:

- **Per-user visibility.** The section catalog is `MANAGER_DASHBOARD_SECTIONS`
  in `src/lib/dashboard-preferences.ts`; visibility is read via
  `useDashboardVisibility(userId)` (localStorage, per user, override-only store
  + `DASHBOARD_PREFS_EVENT`). When you ADD a dashboard section, add it to the
  catalog AND gate its render on `visibility.<id>`, or it silently bypasses the
  Customize modal. The KPI stat row is deliberately NOT in the catalog — it is
  the always-on at-a-glance layer.
- **Collapse to survive a phone.** Each `AttentionGroup` is a collapsible card
  that opens by default only when it has items (`open = override ?? !isEmpty`),
  so empty groups collapse to a one-line header instead of stacking a wall of
  empty states. Keep new groups on that pattern.

The same list-density problem exists on the **resident** dashboard
(`resident-dashboard.tsx`, same `AttentionGroup` shape) — not yet migrated.

## Marketing mocks must use portal-accurate copy

Every product mock on the marketing site — the homepage Applications panel
(`landing-applications-pipeline.tsx`), the ops task rows in
`landing-home-sections.tsx`, the guide art under `public/marketing/` — depicts
a screen a manager can actually open. Marketing-only slang that no portal
surface ships ("lease packet", "lease draft") reads as a fake product and has
been rejected in review twice.

Before writing mock copy, open the real component and copy its labels:

| Mock | Source of truth |
| --- | --- |
| Applications panel | `manager-applications.tsx` — tabs Pending / Approved / Rejected, badges from `applicationStatusPill` (New / Screening / Screened / Flagged / In progress), row actions Approve / Reject / Send reminder / Delete |
| Lease task rows | `manager-leases.tsx` — Manager review / Resident signature pending / Manager signature pending / Signed |
| Section names in task rows | `src/lib/portals/pro.ts` (Leases, Payments, Services → Work orders / Vendors, Communication) |

Rows in a mock must also be internally consistent: a table filtered to Pending
cannot show an `Approved` badge, because that row lives on another tab.

**Guide art** (`public/marketing/guide-*.webp`) is authored at **1800×920**
(≈1.96:1) to match the `.lp-chapter .lp-art` box (`min-height: 200px`,
`object-fit: cover`, `object-position: top left`), so the whole screenshot
lands in the card instead of a tight crop that reads as texture. Regenerate with
`node scripts/generate-marketing-guide-art.mjs`, which renders each board at
900×460 and captures at 2× — a portrait crop of a live portal screenshot does not
fit this box.

That script does **not** import from `src/`. It hand-authors a standalone HTML
replica whose colours are literal hexes and whose labels are copied strings, so a
portal rename or a token retune leaves the art silently stale. Re-verify the copy
against its source component every time you regenerate:

| Board | Copied from |
| --- | --- |
| `guide-tours.webp` | `portal-calendar-panels.tsx` — the availability week: `Copy previous week` / `Create block` / `Clear week` / `Update to houses`, the `Time` + weekday header cells, the `Open` slot, the `N open` week badge |
| `guide-messages.webp` | `manager-inbox-schedule-panel.tsx` — columns `Send date & time` / `Source` / `Recipient` / `Topic` / `Subject` / `Status`, the `Automated` source chip; tab names and order from `INBOX_TAB_DEFS` in `portal-inbox-ui.tsx` |

Every count a board prints (the calendar's per-day "N open" headers and week
total, the inbox tab badges) is **derived in that script from the rows and cells
the board actually draws**, never typed in beside them. Hand-authored totals
drift from the art the moment a row is added, which is the same
internal-inconsistency failure as a Pending tab showing an `Approved` badge.

## Brand assets (PropLane)

The product is **PropLane**; the `Axis*` component names are historical, not a
second brand. Anything user-visible reads PropLane, and the mark is the
paper-plane glyph — never the legacy "AX" letters.

| Surface | File |
| --- | --- |
| Browser tab / bookmarks | `src/app/icon.svg` and `src/app/favicon.ico` (Next file conventions — keep the two in sync) |
| Header / footer lockup | `AxisLogoLink` in `src/components/brand/axis-logo.tsx` (mark + `AxisLogoWordmark`) |
| iOS app icon + launch screen | generated by `scripts/generate-ios-brand-assets.mjs` — details in [`docs/mobile-app.md`](docs/mobile-app.md). Android's launcher icon is still the legacy "AX" lettermark (known gap, tracked there). |

`favicon.ico` has no generator script checked in; it is built from `icon.svg`
with `sharp` (16/32/48 as 32-bit BMP entries plus a 256 PNG entry). Regenerate
it whenever `icon.svg` changes — a stale `.ico` wins in the tab on browsers
that prefer it, so editing only the SVG leaves the old mark visible.

# Branching & deployment (Vercel)

The Vercel project (`axis-2`, connected to `PrakritR/AXIS-2`) is configured so the
**Production Branch is `main`**. There is **no `production` branch** — it was
deleted after the production branch was migrated to `main`; don't recreate it.
Two branches, two roles:

- **`main` — the live site.** Every push here triggers a **production deploy** to
  the real domains: the canonical `prop-lane.space` / `www.prop-lane.space`, the
  legacy `axis-seattle-housing.com` / `www.axis-seattle-housing.com` (still live,
  still recognized as production by `isProductionAxisHost`), and
  `axis-2.vercel.app`. A push to `main` **also** ships an iOS TestFlight build
  (see below). Outbound email/SMS and shareable links use the canonical origin
  (`PRODUCTION_APP_ORIGIN` in `src/lib/app-url.ts`). Only ship-ready code reaches
  this branch. Never commit straight to it.
- **`prakrit` — integration / staging.** Day-to-day work merges here. Every push
  produces a **preview deploy**, and Vercel keeps a stable branch alias that
  always points at the latest `prakrit` build —
  `axis-2-git-prakrit-prakritramachandran-6082s-projects.vercel.app`. That URL is
  the staging preview the ship gate asks you to verify. Feature branches also get
  their own preview URLs.

**Promote `prakrit` → `main` to ship.** When `prakrit` is verified on staging and
you want it live:

```
git checkout main
git pull
git merge --ff-only prakrit   # main should stay a fast-forward of prakrit
git push origin main          # Vercel auto-deploys web + triggers iOS TestFlight
git checkout prakrit
```

Keep `main` a strict fast-forward of `prakrit` (never commit unique work to
`main`); this keeps history linear and makes rollbacks obvious. To roll back,
point `main` at the previous known-good commit and push, or use Vercel's
**Instant Rollback** in the dashboard.

Deploying `prakrit` as a staging step is standard practice on Vercel: its
preview/branch alias is your staging environment, and `main` is the gated
promotion target. Don't add a separate Vercel project for staging — the branch
model above already gives you prod + staging from one project.

The Production Branch setting lives in **Vercel → Project `axis-2` → Settings →
Git**. It is `main`; don't change it.

## Production push also ships iOS (TestFlight / Xcode)

Every push to `main` must update **both** the live website **and** the mobile app
pipeline:

1. **Vercel** deploys the Next.js site (WebView content for Capacitor).
2. **GitHub Actions** workflow [`.github/workflows/ios-testflight.yml`](.github/workflows/ios-testflight.yml)
   runs on `push` to `main`: `npx cap sync ios` with
   `CAP_SERVER_URL=https://www.axis-seattle-housing.com`, then
   `bundle exec fastlane beta` uploads a new build to **TestFlight**. The
   workflow also exposes `workflow_dispatch` for an on-demand build.

Agents promoting to production **must**:

- Confirm ASC secrets exist (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`) so the
  macOS job does not self-skip.
- After `git push origin main`, watch the **iOS TestFlight** workflow until green
  (or report the failure). Do not treat “web deployed” as done.
- If native shell files changed (`ios/`, `capacitor.config.ts`, plugins,
  permissions), call out that TestFlight + App Store review may be required
  beyond the automatic upload.
- Run `npm run ship:preflight` before promoting when available.

Portal UI/API changes reach the installed app via the production WebView URL
without waiting for App Store review; the TestFlight build keeps the native
shell (plugins, splash, push, deep links) in sync with the repo.

Full mobile model: [`docs/mobile-app.md`](docs/mobile-app.md).
Ship checklist: [`docs/ship-gate.md`](docs/ship-gate.md).

# Mandatory ship / change gate (agents)

Before marking feature work done, and **always** before promoting `prakrit` →
`main`, agents must complete this gate. Skipping is not allowed unless the user
explicitly waives a named step.

## 1. Reviews (run in parallel when possible)

| Review | How |
| --- | --- |
| **Security** | Launch `security-review` subagent (`Diff: branch changes`) — authz, secrets, injection, IDOR, RLS |
| **Bug / correctness** | Launch `bugbot` subagent (`Diff: branch changes`) — logic bugs, race conditions, regressions |
| **Cache / rendering / performance** | Check Next.js cache directives, RSC vs client boundaries, list virtualization, image/font loading, unnecessary client JS; use Vercel performance guidance when UI/routes changed |
| **Web ↔ native parity** | Follow `.cursor/rules/web-native-parity.mdc` when portal/nav/push/routes change |

Summarize findings for the user. Fix **high/critical** issues before ship; ask
before deferring medium findings.

## 2. In-depth feature testing (every change)

Do **not** stop at unit tests. For the feature that changed:

1. **Happy path** — exercise the full user flow in the browser on localhost
   (or staging), signed in as the real role (manager/resident/vendor/guest).
2. **Edge cases** — empty states, invalid input, expired tokens, unauthorized
   access, offline/sync failure, duplicate submit, mobile viewport, demo vs
   non-demo if relevant.
3. **Cross-surface** — if the change touches applications / leases / emails /
   resident portal / co-managers / payments, verify each connected surface still
   works together.
4. **Regression** — run targeted unit/integration tests for the area, then
   `npm run test:unit` (or the package’s equivalent) before promote.
5. **Record** — briefly list what you tested and what failed/fixed in the PR or
   handoff note.

`/demo` is **not** a substitute for production-like testing. Prefer `/portal`,
`/rent/apply`, and real auth against the **dev/test** Supabase project.

## 3. Promote checklist

```
[ ] Reviews complete (security + bugbot + cache/rendering as applicable)
[ ] Feature fully exercised + edge cases checked
[ ] Unit/integration tests green for the change
[ ] prakrit verified on staging preview
[ ] ff-only merge prakrit → main + push
[ ] Vercel production deploy healthy
[ ] iOS TestFlight workflow green (or secrets gap reported)
```

# The PostgREST surface is public — RLS row predicates are not a column gate

`supabase/config.toml` exposes the `public` schema through PostgREST, so **any
privilege `anon` / `authenticated` holds is reachable from a browser console
with the shipped public anon key.** RLS is the only thing in front of it, and
RLS constrains *which row* you may write — never which column or value.

That distinction shipped a critical privilege escalation: `profiles_update_self`
was `FOR UPDATE USING (auth.uid() = id)`, so
`update profiles set role='admin' where id=<me>` satisfied the predicate
perfectly. `profile_roles_insert_self` had the same shape. Closed in
`20260722123000_lock_role_grant_surface.sql`.

**Rules for any table the auth/permission layer reads as a trust signal**
(`profiles`, `profile_roles`, `vendor_invites`, and anything like them):

- **Grant client roles `SELECT` only.** A `WITH CHECK` cannot express "you may
  not change this column", so if a write grant exists, assume every column in
  the row is attacker-controlled. Column-level `GRANT`s are the load-bearing
  control, not the policy.
- **Never `FOR ALL`** on a client-reachable table — it governs `INSERT` and
  `UPDATE` too, and `WITH CHECK (owner = auth.uid())` is trivially satisfied by
  an attacker naming *themselves* as the owner. Precedents to copy:
  `20260705120000_work_order_bids_vendor_select_only.sql`,
  `20260708174235_vendor_invoices_vendor_select_only`.
- **Revoking `UPDATE` also revokes it for the user-scoped server client**
  (`createSupabaseServerClient`), not just the browser — that client is
  `authenticated` too. Self-service writes belong in a route that authorizes the
  session and then writes with `createSupabaseServiceRoleClient()` pinned to
  `user.id`. `PATCH /api/profile` is the reference implementation — it is the
  browser's only write path onto `profiles` (the resident Settings save now
  posts to it instead of using the browser client). `/api/manager/phone` is the
  other self-service writer and already followed this shape.
- **Trust columns are wider than `role`.** `filterAdminUserIds` also grants
  admin on `profiles.email = PRIMARY_ADMIN_EMAIL`, and that column carries no
  unique constraint — self-writable `email` was an independent route to admin.
  `sms_from_number` / `phone_verified_at` back the SMS trust boundary the same
  way.
- **Ids in a request body are not authorization.** `assigned_property_ids` on a
  co-manager invite was stored verbatim, so a manager could name a victim's
  publicly-listed property and take it over. Validate against ownership
  (`findPropertyIdsNotOwnedByManager`) and treat a missing row as unowned.
  Ownership is re-derived at every WRITE (create *and* accept) and deliberately
  NOT at read — the reasoning, the read-path trap, and the residual risk are in
  [`docs/agents/co-manager-access.md`](docs/agents/co-manager-access.md).

Regression coverage: `tests/unit/role-grant-surface.test.ts` replays every
migration and fails if a later one re-grants DML or re-adds a write policy on
those tables. The live proof is `scripts/verify-role-escalation-closed.mjs`,
which signs up a throwaway resident and runs the real attack over HTTP against
the dev project — run it after touching policies or grants. It writes real rows,
so it refuses to start unless `ALLOW_PROBE_TARGET` names the Supabase project ref
parsed from `NEXT_PUBLIC_SUPABASE_URL` (check it is not production first):

```
ALLOW_PROBE_TARGET=<dev-project-ref> \
  node --env-file=.env scripts/verify-role-escalation-closed.mjs   # dev/test only
```

**Write every migration idempotently** (`drop policy if exists` before `create
policy`, etc.). Supabase records migrations under apply-time versions rather
than repo filenames, so they get replayed by `db push --include-all` — see
[`docs/database-environments.md`](docs/database-environments.md#migration-versions-are-apply-time-not-filenames).

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

# Portal routing precedence (a section can be silently unreachable)

A portal section is only reachable if **both** layers above it let the request
through. Two classes of bug have shipped here, each making a live nav item dead
while the section's component still compiled and its tests still passed:

1. **`next.config.ts` `redirects()` outranks the app router.** A legacy entry
   whose `source` later became a real section shadows it before
   `renderPortalSection` ever runs. Before adding a section, grep
   `next.config.ts` for its path; when deleting a section, delete its redirect
   with it.
2. **Legacy redirects in `renderPortalSection` fire for every portal unless gated.** The
   rewrites near the top of `src/lib/render-portal-section.tsx` run before
   `findSection`, so an ungated `section === "..."` rule fires for *every*
   portal. Gate on the capability, not a kind allowlist — e.g. the Inbox →
   Communication rewrite checks `findSection(def, "communication")`, so it can
   only fire for a portal that actually has a Communication section to land in.

Neither layer is covered by the unit suite. After adding or renaming a section,
load its URL in the browser — a passing build is not evidence it resolves.

## Inbox panels: the standalone page shell is a /demo-only path

`ManagerInbox` (and the resident / vendor / admin inbox panels, which share the
shape) render two ways, and the split decides whether your UI ships at all:

```ts
if (embeddedInCommunication) return inboxBody;   // the real portal stops here
return <ManagerPortalPageShell filterRow={…}>{inboxBody}</ManagerPortalPageShell>;
```

`/portal/inbox/*` redirects to Communication, and `ManagerCommunication` mounts
the panel with `embeddedInCommunication` — so in production the panel is ALWAYS
the embedded branch and Communication owns the title, tabs and filter row. The
standalone `ManagerPortalPageShell` branch is reached only by
`src/components/demo/demo-section-renderer.tsx`. Anything added to that shell's
`titleAside`/`filterRow` (a search box, a filter, an action button) is therefore
**/demo-only dead code in the real portal**, and testing it on `/demo` will not
catch that. Put shared controls in `inboxBody`, or render them in both branches.

Related: controls inside `inboxBody` are gated on `tabId`, which stops being the
row's folder the moment a view spans folders (e.g. search results). Derive
destructive actions and column labels from the ROW's folder, not the active tab
— on the Trash tab the per-row "Delete" is a no-confirm permanent delete, so
inheriting it for a live inbox row destroys real mail. Coverage:
`tests/unit/manager-inbox-search.test.tsx`.

### Manager Communication is one unified, conversation-based inbox (no folder tabs)

The real manager Communication surface (`manager-communication.tsx` →
`manager-unified-inbox.tsx`) is a single conversation list + chat threads, NOT
the old Unopened / Opened / Sent / Trash / Schedule tab bar. Invariants:

- **No folder tabs.** `ManagerUnifiedInbox` shows ALL live conversations
  (inbox + sent) in one list; the `tabId` route param is legacy and does not
  segregate the list. Archived (trashed) conversations are reachable via the
  `unified-inbox-archived-toggle`, and trash/restore live in the open thread
  header — never re-add a top-level Schedule/Trash tab. `INBOX_TAB_DEFS` and the
  standalone tabbed `ManagerInbox` shell survive only for the /demo path and
  legacy route redirects.
- **Scheduled messages render INLINE in the recipient's thread** as
  "Scheduled · sends <when>" cards (`InboxScheduledCard`), cancel/send-now/edit
  in place — the standalone Schedule table is gone from production. Matching is
  pure: `scheduledItemsForRecipient(email, manual, automation)` in
  `src/lib/inbox-scheduled-thread.ts`. Manager-vs-resident edit permissions are
  unchanged (resident-originated rows are cancel-only).
- **Thread messages are channel-tagged** (`InboxBubbleMessage.channel`,
  `InboxChannel = email|sms|whatsapp|gmail`). Email is the only live channel; the
  tag exists so SMS/WhatsApp/Gmail tag into the SAME per-person thread (built on
  the one-thread-per-person `portal-inbox-delivery.ts` foundation) rather than a
  parallel list. Bubbles render the FULL body (pre-wrap, no clamp).
- **SMS UI is gated by `isSmsCommUiEnabled()`** (`src/lib/sms-comm-ui-flag.server.ts`,
  env `SMS_COMM_UI_ENABLED`, default OFF, server-resolved and threaded as the
  `smsUiEnabled` prop through `manager-communication.tsx` → `manager-unified-inbox.tsx`
  → `manager-communication-compose-modal.tsx`). It gates ONLY the UI — SMS
  transport, both SMS agents, and phone provisioning stay live. ⚠️ While hidden,
  inbound-SMS notices must stay visible: `filterEmailInboxThreads(rows,
  { keepSmsLike: !smsUiEnabled })` lets them fall through into the conversation
  list instead of vanishing into the hidden SMS panel. Coverage:
  `tests/unit/unified-conversation-inbox.test.tsx`,
  `tests/unit/inbox-scheduled-thread.test.ts`,
  `tests/unit/inbox-thread-omnichannel.test.tsx`,
  `tests/unit/sms-comm-ui-flag.test.ts`.

# Feature architecture notes (mandatory pre-reads)

The deep per-feature history lives in `docs/agents/` — one file per area.
**Before changing code in an area, READ its file.** The one-line invariants
below always apply; the files carry the full rationale, schemas, and gotchas.

| Area | Read first | Never violate |
| --- | --- | --- |
| Vendor portal (roles, bids, Connect payouts) | `docs/agents/vendor-portal.md` | Vendor reads scope by `vendor_user_id = auth.uid()`; writes go through service-role routes; an accepted bid's `amount_cents` is the immutable payout anchor. |
| Financials (ledger, GL, deposits, AP, NSF) | `docs/agents/financials.md` | Every charge/payment write MUST call `syncLedgerChargeEntry`/`syncLedgerPaymentEntry` + GL posting next to the DB write — the ledger is write-through only, never read-time backfill. `security_deposit` books to liability, not income. |
| Vendor invoicing (Phase 4) | `docs/agents/vendor-invoicing.md` | Invoice totals recomputed server-side from line items; vendor tools live in `vendorAgentRegistry`, never the manager registry. |
| Resident payments (resident-paid processing, ACH clearing) | `docs/agents/resident-payments.md` | The resident pays the processing/service fee on every method (card/Link and ACH) so the manager's payout equals the subtotal; `processing` charges are ignored by late fees/reminders/re-pay. |
| Documents module | `docs/agents/documents-module.md` | `manager-documents` bucket is PRIVATE — bytes only via server-minted signed URLs after an ownership check. |
| Demo / sandbox accounts | `docs/agents/demo-sandbox.md` | `/demo` must never write real rows — every authed fetch from demo surfaces is `isDemoModeActive()`-gated. The static snapshot ships EMPTY; a demo portfolio comes from the canonical `@test.axis.local` accounts via the mirror, never a fictional fixture in code. |
| Co-manager access | `docs/agents/co-manager-access.md` | Writes require `assertCoManagerModuleAccess(..., { level: "edit" })`; empty permissions object = full grant on assigned properties. |
| SMS / phone system | `docs/agents/sms-system.md` | Outbound sends only from a per-manager work number (never fake a personal number); relay numbers stay disjoint from work numbers. Conversation identity is `owner:role:person_ref` (`sms-conversation-identity.ts`), NOT the phone pair — two people on one shared line must never share a thread. Public listing CTAs get their number from `resolveListingCtaSmsPhone` — production texts that listing's own manager, dev/preview the shared Claw line — and the browser never substitutes one. |
| Vendor dispatch + vendor agent | `docs/agents/vendor-dispatch-agent.md` | The vendor agent is answer-only: reads pinned to one work order + `escalate_to_manager` via explicit allowlist; `row_data.dispatch` is server-owned. |
| Inbound support email → admin inbox | `docs/agents/inbound-email-inbox.md` | `support@prop-lane.space` (Resend Inbound `email.received`) lands in the `scope="admin"` inbox via the existing upsert layer; webhook Svix-verifies and fails closed on Vercel; the insert of thread id `inbound_email_<email_id>` makes re-delivery idempotent (unique-violation = no-op) and runs inline from metadata alone so a failed write 500s and Resend retries; the body arrives via a best-effort `after()` pass that writes only while the stored body is still the placeholder. Receive-only — an in-app reply never emails the sender. Never widen the founder identity — attribute TO it. |

## Per-room rent basis: monthly (default) vs daily

A room can be priced **monthly** (the default, unchanged) or **by the day**. The
model is fully additive — every existing room is monthly and behaves exactly as
before. Three DISTINCT "daily" concepts now coexist; do not conflate them:

- **`rentBasis: "monthly" | "daily"` + `dailyRentPrice`** (new, on
  `ManagerRoomSubmission`) — the room's HEADLINE price and billing basis. This is
  the daily-rent-rate system.
- **`prorateMethod: "auto" | "daily_rate"` + `dailyRentRate`** — proration-only;
  it just prorates the partial edge months of a *monthly* room. Never a headline.
- **`shortTermDailyCost`** — nightly short-term/guest stays. Unrelated.

**Interaction rule (the single tiebreaker).** A room always keeps `monthlyRent`.
`rentBasis` alone decides which rate is active: absent/`"monthly"` → monthly drives
display + every charge (identical to legacy); `"daily"` (requires
`dailyRentPrice > 0`) → the listing shows `$X/day` and every rent charge (first
month, each recurring month, partial last month) bills `billable-days ×
dailyRentPrice` using each month's REAL day count. **Daily never wins unless the
manager explicitly sets `rentBasis = "daily"`**, so monthly rooms are untouched.
Normalization downgrades `rentBasis="daily"` to `"monthly"` when no positive daily
price is set. One exception at charge time: a resident's own negotiated monthly rent
(a `managerRentOverride` or a signed/renewed rent) still beats the room's daily basis,
exactly as it already beats the room's listing monthly rent.

- **Single source of truth:** `src/lib/room-pricing.ts` (`roomIsDailyPriced`,
  `roomHeadlinePriceLabel`, `roomMonthlyEquivalent`, etc.). Use it for any new
  price surface instead of reading `monthlyRent` directly.
- **Aggregate labels** (rent ranges, "starting at", estimated totals, browse-card
  sort/budget) normalize daily rooms to a monthly-equivalent
  (`dailyRentPrice × DAILY_RENT_MONTH_ESTIMATE_DAYS`, 30 days) so mixed listings
  stay coherent as `/mo`; each room's OWN row still shows its true `$X/day`.
- **Charges:** the daily basis threads through `recordApprovedApplicationCharges`
  and the recurring generator via `RecurringRentProfile.dailyRentPrice` in
  `src/lib/household-charges.ts`. It extends the existing daily proration to full
  months — utilities stay monthly.
- Coverage: `tests/unit/room-pricing.test.ts`, `tests/unit/daily-rent-rate.test.ts`,
  `tests/unit/daily-rent-charges.test.ts`, `tests/unit/daily-rent-profile-clear.test.ts`.

## Add-on services vs. work orders

Parking, storage, and other resident-purchasable offerings are **"Add-on
services"** in every UI surface and in agent copy — never "work orders". They
were already a separate data model before that rename: `ServiceRequest` rows in
`portal_service_request_records` (`src/lib/service-requests-storage.ts`), edited
via `manager-create-service-request-modal.tsx` / `resident-services-panel.tsx`
("Add-on services" tab) and read by the `list_service_requests` agent tool
(`src/lib/tools/domains/services.ts`). Real maintenance/repair work orders keep
their name and live in the separate `portal_work_order_records` model
(`src/lib/manager-work-orders-storage.ts`, `list_work_orders` tool). The two
share only a "Services" nav section and a combined nav-count badge
(`src/hooks/use-portal-nav-counts.ts`) — do not merge their tables, tabs, or
counts when adding features to either.

# Property drafts (save add-property progress)

A manager can save an in-progress "add property" wizard and finish it later. This
is a `"draft"` value on the existing `ManagerPropertyRecordStatus`
(`src/lib/persisted-property-records.ts`) — **NOT** a parallel drafts store, and
**NOT** `"unlisted"` (which means a previously-live listing the manager took
*down*; a draft has never been published). Key invariants:

- **Drafts never reach a prospect surface.** They have `status = "draft"` (never
  `"live"`) and no `property_data`, so `getPublicListings()`
  (`src/lib/public-listings.server.ts`, filters `status = "live"`) and the browse
  /search components exclude them with zero extra code. The record's RLS
  `select_own` policy keeps a draft private to its owner; co-managers never see
  another manager's drafts (they carry no linked-property grant).
- **Storage = the existing side-bucket pattern.** A draft is an `AdminPropertyRow`
  (carrying the full `submission` for resume) in a new `drafts` side bucket
  (`PropertyPipelineSnapshot`, `SideBuckets`, `AdminPropertyBucketIndex` 5). Save
  /publish/delete live in `demo-admin-property-inventory.ts`
  (`saveManagerPropertyDraftToServer` / `publishManagerPropertyDraftToServer` /
  `deleteManagerPropertyDraft`).
- **The draft's record id IS the eventual live `mgr-…` listing id.** Publishing
  (final "Submit listing") re-upserts the SAME id `draft → live` and drops it
  from the drafts bucket — no orphaned duplicate. A brand-new wizard that used
  "Save draft" mid-way also publishes-in-place via the remembered id (`draftIdRef`
  in `manager-add-listing-form.tsx`), never a second row.
- **That id is therefore a permanent public URL, so it is never minted from a
  blank name.** A save made before the manager typed a property name gets a
  neutral `mgr-listing-<rand>` id flagged `draftIdProvisional`, never a
  blank-slug `mgr---<rand>`. The first later save *in the same wizard session*
  re-keys it to the real `mgr-<building>-<unit>-<rand>` id — **write before
  delete**: the re-keyed row is upserted first and only then is the superseded
  row deleted, so a failed save can never leave the draft with *no* server
  record. If that delete fails the stale row deliberately stays visible in the
  Drafts list so the manager can remove it; a short-lived duplicate draft is the
  only tolerated intermediate state, never a missing one. A **resumed** draft
  keeps its id (`allowIdUpgrade: false`) — re-keying it would change the drafts
  table row key and unmount the open editor. Publishing is always in place, so
  the one-record invariant holds either way. Unnamed drafts render as "Untitled
  draft" in the list.
- **Save draft is unvalidated** (partial-friendly, on every step) and does NOT
  count toward the plan property limit; **publishing** runs full validation +
  the limit gate like any new listing — so the wizard's `skuTier`/`skuLoaded`
  come from the one `/api/manager/subscription` load in `manager-properties.tsx`
  (a null tier reads as "no limit", so Continue editing waits for `skuLoaded`).
  Saving also persists the wizard position (`draftStepIndex` /
  `draftMaxStepReached`) so resuming reopens on the saved step with the earlier
  chips unlocked. The list surface is the "Drafts" stage in `MANAGER_STAGES`
  (`manager-house-properties-panel.tsx`) with Continue editing / Delete draft.
  Migration: `…_manager_property_records_draft_status.sql` adds `'draft'` to the
  status CHECK.
- **The wizard is the only editor of a draft.** The drafts row (bucket 5) hides
  every detail panel that persists through `houseSaveTarget` (House details,
  Application questions, Lease) — a draft is absent from the extras catalog, so
  those panels would resolve to `{mode: "listing"}` and their save would mirror
  the record `status: "live"`. **Unlisted rows (bucket 3) hide the same three
  panels for the same reason**: `unlistManagerListing` calls
  `removeExtraListing`, so an unlisted listing is likewise absent from the live
  catalog and saving one used to silently re-list it. Relist it to edit it.
  `updateExtraListingFromSubmission` refuses an id it cannot find in the live
  catalog (searching every owner's key, so co-managed listings still save),
  which is the backstop for that whole class of "edit a non-live row into the
  public catalog" bug.
- **Deleting a draft reclaims its uploads.** `deleteManagerPropertyDraft` is
  async: it awaits the server delete and reports success only when the row is
  really gone (a failed delete leaves the draft visible instead of letting it
  reappear on the next sync), then removes the submission's `listing-photos`
  objects via `deleteSubmissionMediaObjects`
  (`src/lib/listing-media-storage.ts`). **A record does not own its uploads
  exclusively** — the wizard dedupes uploads per data URL, so the two draft rows
  a partially-failed re-key leaves behind reference the *same* bucket objects.
  `deleteSubmissionMediaObjects` therefore takes every surviving submission
  (`survivingSubmissions`: the other side-bucket rows, the live catalog and the
  pending queue) and skips any path still referenced; deleting the leftover
  duplicate must never strip the surviving draft's photos. Draft *count* is
  deliberately uncapped.

## Group applications & lease bundles (independent accounts)

A "group application" (roommates / a bundled lease household) is **several
independent applications tied by a shared Group ID**, never one merged record.
Each member keeps their own application row (`manager_application_records`), own
email, own AXIS id, own screening, and — once approved — their own resident
account and single-resident `LeasePipelineRow`. Nothing about the group changes
the 1-application → 1-account → 1-lease model; the group is a **reconciliation
view**, so every resident on a bundled lease still owns an independent login,
portal, and identity while the household reads as one unit.

- **Shared Group ID (`AXISGRP-…`).** The first applicant mints it on submit
  (`resolveSubmitGroupId` in `src/lib/rental-application/application-groups.ts`);
  it is stored on `application.groupId` in that member's snapshot and echoed on
  the finish screen (`rental-application-finish-panel.tsx`) to copy/share.
  Joining applicants paste it in wizard step 1 (`rental-wizard-steps.tsx`) and it
  validates via `validateAxisGroupId` (prefix + length ≥ 12).
- **Reconciliation is pure + testable.** `application-groups.ts` groups rows by
  normalized `groupId`, derives expected size from the first applicant's
  `groupSize`, and computes `submittedCount` / `missingCount` / `isComplete`.
  `manager-applications.tsx` renders it as a "Group N/M" row badge plus a
  per-application "Group application" roster (`ApplicationGroupSection`).
- **No silent deadlock.** A group never *blocks* — approvals stay per-member.
  An unfinished member surfaces as "waiting on N", it does not gate the others.
- **Money-adjacent surfaces are untouched.** Screening stays per-person (each
  member fills the full wizard), and deposits / rent / charges are still
  generated per approved application — there is **no** bundle-level split,
  proration, or shared-signature lease document. Add those deliberately if ever
  needed; do not infer them from group membership.
- The listing-side `ManagerBundleRow` (grouped rooms at one price, applicant's
  `bundleId`) is a **separate** concept from group *applications* — a bundle is a
  room offering, a group is a set of applicants. Do not conflate them.

# Financials UI cleanup (Blue Steel consolidation)

**Single Button component.** `src/components/ui/radix-button.tsx` (shadcn/CVA, with a filled-red
`destructive` variant) was deleted — `src/components/ui/button.tsx` is the only Button, and it now
supports `asChild` via `@radix-ui/react-slot` so it can wrap a `<Link>`. It has no `size` prop;
translate an old `size="sm"`/`size="icon"` into utility classes (`h-9 min-h-0 px-4 text-[13px]` /
`h-10 w-10 min-h-0 px-0`) at the call site. `danger` stays text-only red per `docs/design.md` —
never reintroduce a filled-red destructive variant.

**Tab/pill rule enforcement.** `PortalPanelTabs` (`panel-tab-strip.tsx`, unused) and
`resident-financials-panel.tsx` (hand-rolled `bg-foreground text-background` tabs) were both
deleted. Resident **Payments is Charges-only** — one screen at the bare `/resident/payments`
with no `TabNav` switcher, both resident section registries declaring `tabs: []`, and every
legacy sub-path redirecting there (an unknown sub-path must still `notFound()`). The
Pending / Overdue / Paid `ManagerPortalStatusPills` stay, because they are in-section *status
filters*, not URL-linked section tabs. The legacy-path map, the report routes deliberately left
in place, and the rest of the detail live in
[`docs/agents/resident-payments.md`](docs/agents/resident-payments.md).

Two routing gotchas this exposed, both of which silently break a section without failing a build:

- **Legacy section redirects must run before `findSection`.** `financials` is not a resident nav
  section, so a redirect placed after `findSection` is dead code — `notFound()` fires first.
- **`/demo` renders portal panels directly**, not through `render-portal-section.tsx`, and
  `src/components/demo/demo-section-renderer.tsx` has its own per-section prop list. When you add
  sub-tabs to a section wired into the demo, forward `tabId`/`basePath` there too or the demo
  always shows the first tab no matter which `TabNav` link is clicked.

## Approval-first automated tours

When a manager opts in (`proposeTourConfirmations`, default OFF, on
`manager_automation_settings`), a new pending tour inquiry generates a PROPOSAL
to confirm it into the first matching open slot. It NEVER auto-books or emails —
the proposal is a gated pending action the manager approves. Invariants:

- **One booking core.** `confirmTourInquiry` (`src/lib/tour-inquiry-confirm.server.ts`)
  is the single implementation behind both the manual accept route and the
  auto-tour tool — `resolveConfirmedEnd`, plannedEvent creation, competing-inquiry
  removal, `notifyTenantTourConfirmed`. Never duplicate booking logic; the tool
  path passes `guardDoubleBook: true` (refuse a slot a confirmed tour occupies),
  the manual route leaves it off to keep its override behavior.
- **Reuses the confirm gate.** The proposal is an `agent_pending_actions` row
  (`confirm_tour_inquiry` write tool in `agentRegistry`) with a 7-day expiry;
  approve/discard go through `runConfirmedPendingAction`/`denyPendingAction`
  (`src/lib/tools/confirm-gate.server.ts`) — the SAME gate the assistant uses.
  Standalone surface: `GET/POST /api/portal-tour-inquiries/proposals` +
  `TourProposalsPanel` on the manager calendar.
- **First-open-slot math** (`src/lib/tour-proposal.server.ts`, `tour-slot-math.ts`)
  mirrors the public availability route's exclusion set; it excludes the
  inquiry's own window so it never blocks itself. No slot match → no proposal.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
