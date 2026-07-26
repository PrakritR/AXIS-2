# PropLane beta-test — findings report

**Branch:** `fm/axis-qa-journeys` (off `origin/prakrit`)
**Env:** localhost `:3200`, dev Supabase `emstjswhotsnyksqhqyf` (never production).
**Method:** two isolated real Chrome instances (own cookie jars, never the captain's
browser) — one as the manager, one as guest/resident — driven via `chrome-devtools-axi`.
Facts cross-checked against the dev DB via the Supabase MCP.

**Test identities (dev DB, throwaway):**
- Manager: `qa-mgr-0726133824@proplane-qa.test` (Jamie Rivera)
- Seeded listing: `mgr-qa-madison-9f3k2z` — "QA Madison Studio", $1,800/mo, app fee $45, deposit $1,800
- Applicants: `qa-resident-0726` (guest), `qa-resident2/3-0726` (account-based)

---

## Summary

Both journeys were walked end to end in a real browser with screenshot/DB evidence.
All three tiers were exercised. The signup, plan/promo, payment-setup entry points,
listing detail, 12-step application, approval, and resident move-in handoff all work.

The captain surfaced (and then **decided**) a real product gap in the resident
apply/account model mid-run; that decision is now **built, verified, and tested**
(see §Captain items). Two flows I could not fully complete are external dependencies
owned by other concurrent tasks (Stripe fee payment / Stripe Connect); both are
reported, not worked around.

---

## Journey A — new property manager

| # | Step | Result | Sev | Status |
| - | ---- | ------ | --- | ------ |
| A1 | Signup `/auth/create-account` (fresh email) | Clean form; email auto-confirmed server-side (no inbox step); lands on `/portal/dashboard` with a 14-day Pro trial. No dead ends. | — | ✅ works |
| A2 | Portal first-run | Dashboard clean & styled; KPI row, empty-state cash-flow copy, collapsible Needs-attention groups. | — | ✅ works |
| A3 | First-run copy: "0 ROOMS VACANT — **fully occupied**" for a manager with zero properties | "fully occupied" implies occupied units exist; reads oddly for a brand-new account. | low | left (copy nit) |
| A4 | First-run onboarding | No explicit "Add your first property" CTA on the dashboard; the next step (Properties → Create) must be discovered in the sidebar. | low | left (UX gap) |
| A5 | Tiers Free / Pro / Business | Settings → Billing & plan shows a clear 3-plan comparison with feature checklists; current plan marked. | — | ✅ works |
| A6 | Monthly/Annual toggle | Prices update correctly: Pro $20→$192/yr, Business $200→$1,920/yr (~20% off). | — | ✅ works |
| A7 | Plan change both directions | Verified Pro(trial)→Business (upgrade), Business→Pro (downgrade), Business→Free (downgrade via a retention dialog with a required reason). UI reflects each. | — | ✅ works |
| A8 | Promo — invalid code | "NOTACODE123" → clean rejection "That promo code isn't valid." | — | ✅ works |
| A9 | Promo — valid code | `FREE100` (dev payment-waiver; `AXIS_PAYMENT_WAIVER_CODE` empty → dev fallback) → activates the tier instantly, no card, correct message; modal closes; UI reflects new tier. | — | ✅ works |
| A10 | Retention-dialog copy for a **comp** (waiver) account | Says "You'll keep Business until the end of your billing period" but a waiver account has no Stripe billing period (`currentPeriodEnd` null) and drops to Free immediately. | low | **reported, not fixed** (money-adjacent copy) |
| A11 | Payment setup — Stripe / Zelle / Venmo entry points | "Payment setup" modal lists all three with honest copy. Zelle/Venmo open a clear 5-step linking modal. Stripe "Link" → `POST /api/stripe/connect/onboard` returns a valid `connect.stripe.com/setup/…` URL (opened in a new tab). `connect/status` honestly reports not-connected before linking. | — | ✅ entry points work |
| A12 | Stripe Connect onboard vs status | onboard returns an `accountId`, but `connect/status` still reports `accountId:null` immediately after. | — | **reported to Stripe-Connect owner, not fixed** |
| A13 | Listing wizard (6 steps) | Fully fillable; address autocomplete autofills ZIP+neighborhood; validation sensible. | — | ✅ works |
| A14 | Pricing step — required fee fields show placeholder "$0" but are actually EMPTY | Submit rejects with "Move-in fee is required — enter 0 if there is no fee." A manager sees "0" and is confused why it's rejected. | med | left (candidate fix: default to 0, or drop the "0" placeholder on a required-empty field) |
| A15 | Final "Submit listing" in the automation browser | Navigates the tab to `about:blank`, which cancels the in-flight async save → **0 rows written** (confirmed across 3 attempts in the DB). | — | **headless-only artifact, not a product bug** — see note |

**A15 detail.** The submit button is `type="button"` with a plain `onClick={()=>void submitListing()}`; there is NO `window.open`/navigation anywhere in `submitListing()`, `onSubmitted()`, or the save chain. The save API itself (`POST /api/property-records` upsert) works and **preserves the session** (verified by a direct authenticated call: `ok:true`, auth `200` after). So the `about:blank` is a chrome-devtools/CDP headless quirk that races the async save. **Recommend a human spot-check of the final publish in a real (non-headless) browser.** For Journey B I seeded one valid live listing under the QA manager (cloning a known-good listing's structure) so both sides could be exercised.

**A-resilience (low, self-inflicted):** a malformed `manager_property_records` row crashes the *entire* Properties page via `undefined.trim()` at `render-portal-section.tsx:594` (no per-row defensive parsing), and the bad row is cached in sessionStorage (`axis_property_pipeline_cache_v1:*`) so it survives a DB delete until the cache is cleared. Only trusted server code writes these rows, so priority is low — but one bad row = whole-page failure.

---

## Journey B — prospective resident

| # | Step | Result | Sev | Status |
| - | ---- | ------ | --- | ------ |
| B1 | Find listing (public) | `/rent/browse` + `/api/property-records/public` include the listing; `/rent/listings/mgr-qa-madison-9f3k2z` renders as a guest with rent ($1,800/mo, $1,950/mo w/ utilities est.), Lease basics / Amenities / House rules / Location, "At a glance", apply CTAs. Photo-less listing correctly shows `NoImagePlaceholder` (no fabricated photos). | — | ✅ works |
| B2 | Apply gate | Showed only **Sign in + Continue without an account** for a new applicant, while the copy said "We recommend a resident account" — with no way to create one. | med | **captain-reported → decided → FIXED** (see §Captain items) |
| B3 | Application (12 steps, guest) | Full wizard walked; validation is sensible (each required field blocks Continue with a clear message); skip-affordances present. Persists to `manager_application_records` before payment (guest incomplete-application flow). | — | ✅ works |
| B4 | Application fee itemisation | "APPLICATION FEE $45 — No added fees, PropLane covers payment processing" (matches listing + face-value pricing rule) + "HOLDING DEPOSIT $100 — credited toward your security deposit". Correct + clear. | — | ✅ works |
| B5 | Pay application fee | "Pay application fee" → **422** (checkout session not created). Root cause: the QA manager has no Stripe Connect account (a destination charge needs the manager's connected acct); `chrome-devtools` also can't pierce the Stripe iframe. | — | **reported, not fixed** (Stripe-Connect owned) — could NOT complete the card payment |
| B6 | Applicant-started notification | `POST /api/portal/send-application-started` repeatedly returns **503** (dev email service unavailable). | — | reported (dev-env, non-critical) |
| B7 | Manager sees the application | Manager Applications shows both applications (Pending 2), each "QA Madison Studio · Studio · Incomplete". | — | ✅ works |
| B8 | Manager approves | Approve → "Approve application: account setup email" dialog → "Approve & send setup email" → status Approved (Pending 1 / Approved 1). | — | ✅ works |
| B9 | Resident move-in info | After approval the resident has FULL portal access (My home / Lease / Payments / Documents / …); 2 move-in charges generated, correctly gated ("Payments unlock after your lease is fully signed"); a lease is Pending signature. | — | ✅ works |

*(The lease e-signature step itself was not exercised further; the resident demonstrably receives an approved application, a lease to sign, queued move-in charges, payment instructions, and portal access.)*

---

## Captain items — resident apply / account model (decided → built → tested)

The captain reviewed the apply gate and the signup tabs mid-run and **decided the
model**: a prospective resident **creates an account, then applies from inside their
resident portal**; the apply gate needs **Create account (primary) + Sign in + guest**;
Create account carries the listing context and lands them ON that application; the
emailed setup link becomes the **guest fallback only**; contradicting copy is corrected.

**Implemented and verified end-to-end in the browser + DB:**

1. **Apply gate** (`public-apply-account-prompt.tsx`) — now three ordered actions:
   Create account (primary, cobalt) / Sign in (outline) / Continue without an account
   (ghost, last). Copy rewritten. New `publicApplyCreateAccountHref` carries
   `next=/rent/apply?propertyId=…`.
2. **Backend** — re-enabled `POST /api/auth/resident-register` (was 403). **Safe:**
   service-role `createUser` + `provisionResidentAccountByEmail`; a brand-new applicant
   gets `role=resident`, `application_approved=false`, `roles=["resident"]` (verified in
   DB) — no elevated role, no auto-approval; the manager still approves. Existing-email
   path verifies the password (adds resident access), mirroring `manager-register`.
3. **`ResidentSignupForm`** — new component mirroring `VendorSignupForm`'s skeleton
   (Google SSO + Full name / Email / Phone / Password). Wired into the `NativeAuthHub`
   resident tab (replacing `ResidentSignupBlocked`) and the create-account router.
4. **Bug found & fixed while testing:** `navigateAfterRoleSignup` prefers the server
   post-auth resolver over the fallback, which **dropped the propertyId**. Fixed so a
   listing-context `next` navigates straight through — verified: Create account →
   `/resident/applications/apply?propertyId=mgr-qa-madison-9f3k2z` → the in-portal wizard
   shows the "QA Madison Studio · Incomplete" application (lands ON it, not an empty
   dashboard).
5. **Both resident-tab defects fixed by the same change:** "Already have an account?
   Sign in" now appears **once** (was twice); the Terms consent is now appropriate
   (you *can* create an account there). The resident tab now sits in the same visual
   skeleton as Property/Vendor.

**Coverage:** `tests/unit/public-apply-account-prompt.test.tsx` (3, green — href context +
3-action gate render); `tests/unit/resident-register-route.test.ts` (rewritten to the new
validation contract, green); `tests/integration/auth/resident-setup-gate.test.ts` updated.
Full unit suite **green (437 files / 2733 tests)**.

**⚠ Ship-gate note:** re-enabling `resident-register` reverses a documented invariant
(“stays disabled (403)”). This was an explicit captain decision. `AGENTS.md` and
`docs/agents/resident-onboarding.md` were updated to the new model. **A `security-review`
of the branch is required before promote** (self-serve account creation is auth-sensitive).

---

## Could NOT test (with reasons)

- **Stripe application-fee payment (B5)** — the QA manager has no Stripe Connect account
  (destination charge requires it), so the fee checkout 422s; `chrome-devtools` also can't
  drive the Stripe iframe. Stripe-Connect onboarding is owned by another concurrent task.
- **Stripe Connect onboarding completion (A11/A12)** — requires a real Stripe Connect
  account; went as far as a valid hosted-onboarding URL. Owned by another task.
- **Zelle/Venmo receipt matching + Gmail linking** — deliberately not exercised (owned by
  another concurrent task); only confirmed the linking modals start and report honest state.
- **Final listing-wizard publish in a real browser (A15)** — blocked by a headless-only
  `about:blank` artifact; the save API was verified directly instead. Recommend a human
  spot-check.
- **Lease e-signature → payment unlock** — verified the resident receives a lease pending
  signature + gated move-in charges; the e-sign step itself was not driven further.
- **iOS TestFlight** — not applicable to this localhost QA pass.

---

## Files changed on this branch

- `src/app/api/auth/resident-register/route.ts` — enable safe resident self-serve signup
- `src/components/auth/resident-signup-form.tsx` — new resident create-account form
- `src/components/auth/native-auth-hub.tsx` — resident tab → the form
- `src/app/auth/create-account/create-account-router.tsx` — route resident create to the hub
- `src/components/marketing/public-apply-account-prompt.tsx` — 3-action apply gate + copy
- `src/lib/rental-application/public-apply-session.ts` — `publicApplyCreateAccountHref`
- `AGENTS.md`, `docs/agents/resident-onboarding.md` — new resident-onboarding model
- `tests/unit/public-apply-account-prompt.test.tsx` (new), `tests/unit/resident-register-route.test.ts` (rewritten), `tests/integration/auth/resident-setup-gate.test.ts` (updated)
