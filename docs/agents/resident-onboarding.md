# Resident account creation (after a rental application)

Residents never self-serve a generic account. An account is only created once an
application exists and the person proves they control the application's email —
either by holding the one-time **setup token** (emailed, or handed to the guest
in-session right after applying) or by an **OAuth** email match. There is no
password path without a token.

## The one canonical flow

```
apply (guest)                       manager approves
   │  POST /api/manager-applications │  deliverResidentWelcome (resident-welcome.server.ts)
   │  action:"upsert" (unauth)       │  ensureResidentSetupTokenForApplication → token
   │  prepareGuestApplicationUpsert  │        │
   │  mints setup token on the row   │        ▼
   │  returns { setupToken,          │  approval email links /auth/resident-setup?token=&axis_id=
   │            setupHref, axisId }   │
   ▼                                 ▼
finish screen (RentalApplicationFinishPanel)  ── "Create your resident account" → setupHref
   │  wizard also calls send-application-submitted (email backup); passes the SAME
   │  setupToken so the emailed link == the on-screen link (route skips rotation)
   ▼
/auth/resident-setup?token=&axis_id=   (resident-setup-client.tsx)
   │  GET  /api/auth/resident-setup  → validate token, prefill email + name + PHONE
   │  password path  OR  "Continue with Google"
   ▼
POST /api/auth/resident-setup   (password)      POST /api/auth/register-resident-oauth   (Google)
   │  requires PHONE (normalizeE164, 400 if bad) │  token+axis_id authorize; if the Google email
   │  provisionResidentAccountByEmail({phone})   │  DIFFERS from the application, relink the app
   │                                             │  (relinkResidentSetupApplicationEmail) — never reject
   ▼                                             ▼
   sign in → /resident/applications (application visible)
```

## Invariants (do not regress)

- **`POST /api/auth/resident-register` is permanently disabled (403).** It is the
  dead generic path. Nothing may call it; the generic
  `/auth/create-account?role=resident` renders `ResidentSignupBlocked`, not a form.
- **Phone is required** on `/auth/resident-setup` (both password and — via the
  application snapshot — the Google path). `provisionResidentAccountByEmail`
  prefers the caller-confirmed phone over the application's.
- **The setup token is a claim capability — it only leaves via email**, except the
  guest wizard's in-session handoff (the submitter proved email ownership by
  completing the application in that session). `POST /api/auth/resident-setup-link`
  (the "lost my email" resend on `ResidentSignupBlocked` and create-account) emails
  the address on file and NEVER returns the token to the browser; its response is
  neutral (no application enumeration).
- **The finish CTA is server-authoritative and email-independent.** The token is
  minted during the application upsert and its `setupHref` returned there, so a
  failed/unconfigured email send (503) never strips "Create your resident account".
- **OAuth relink is authorized by the setup token, not the email match.** A
  mismatched Google email relinks the application onto the account the applicant
  controls (`resident_email` + snapshot email rewritten) — see
  `register-resident-oauth/route.ts`.

## Files

| Piece | File |
| --- | --- |
| Token lib (mint / validate / relink / consume) | `src/lib/auth/resident-setup-token.ts` |
| Guest upsert (mints token) | `src/lib/auth/guest-application-upsert.ts`, `src/app/api/manager-applications/route.ts` (guest branch) |
| Setup email backup (token reuse, no rotation) | `src/app/api/portal/send-application-submitted/route.ts` |
| Finish CTA | `src/components/marketing/rental-application-finish-panel.tsx`, `…/rental-application-wizard.tsx` |
| Setup screen + password/Google | `src/app/auth/resident-setup/resident-setup-client.tsx`, `src/app/api/auth/resident-setup/route.ts` |
| OAuth (relink) | `src/app/api/auth/register-resident-oauth/route.ts`, `src/app/auth/resident-oauth-finish/page.tsx` |
| Provisioning | `src/lib/auth/provision-resident-account.ts` |
| Resend lost link | `src/app/api/auth/resident-setup-link/route.ts`, `src/components/auth/resident-signup-blocked.tsx` |
| Approval / welcome email | `src/lib/resident-welcome.server.ts` |

## Tests

- Unit: `tests/unit/resident-setup-token-relink.test.ts`,
  `resident-setup-route.test.ts`, `send-application-submitted-handoff-route.test.ts`,
  `register-resident-oauth-relink-route.test.ts`,
  `resident-register-disabled-route.test.ts`, plus existing
  `resident-setup-token.test.ts` / `guest-application-upsert.test.ts`.
- E2E (gated `RESIDENT_SETUP_E2E_ENABLED=1`, dev/test only):
  `tests/e2e/resident-account-setup.spec.ts`.
