# Applicant ID / income photos (rental application)

Applicants can attach photos to their rental application: a **front + back photo
of their driver's license / ID** (Signer Information, step 4) and **proof-of-income
documents** (Employment & Income, step 7). On a phone the "Take photo" button opens
the camera; "Upload file" opens the file picker (or a file on desktop). Both are
optional — a failed camera/upload never blocks submission.

## Why these two steps only

The general-photo requirement was scoped deliberately, not bolted onto every step:

- **ID front + back (step 4)** — the core ask. Sits beside the ID *number* the
  step already collects; identity verification typically needs both sides.
- **Proof of income (step 7)** — the form collects monthly/annual income as
  self-reported numbers with zero evidence; a pay stub / offer letter / bank
  statement is the single most valuable screening artifact, so it earns an
  attachment. (Short-term stays omit the whole employment section, so this never
  appears there.)

Pets/vehicles were intentionally skipped: a pet photo has little screening value
and no vehicle field exists. Add more slots only where a photo genuinely helps.

## Storage & privacy (this is sensitive PII — treat it as such)

- **Private bucket `application-documents`** (`public = false`,
  `supabase/migrations/20260727120000_application_documents_bucket.sql`). No
  client SELECT/INSERT policy exists, so the `anon`/`authenticated` roles are
  default-denied — a leaked anon key cannot read, list, or write. All access is
  the service-role client inside the routes.
- **Object paths are unguessable**: `application/<folder>/<slot>-<ts>-<uuid>.<ext>`
  (`buildApplicationPhotoPath`). A leaked path is useless without passing the
  per-request authorization below.
- **No metadata table.** The only reference is the object path stored on the
  application answers (`row_data.application.idPhotoFront` / `idPhotoBack` /
  `incomeProofPhotos` in `manager_application_records`). So a photo persists and
  **resumes exactly like any other answer** through the existing autosave/resume
  path — never inline base64 (`row_data` is re-uploaded on every keystroke).

## The one route + the one authorization decision

`/api/portal/application-photos` (`src/app/api/portal/application-photos/route.ts`):

- **POST** uploads bytes (MIME allowlist + 15 MB cap enforced server-side by
  `parseApplicationPhotoDataUrl`) and returns the reference the client stores on
  the form. A **failed upload returns an error and never a reference** — the
  client leaves the field untouched, so a failure can never look like success.
- **GET** streams a stored photo. The storage path is resolved from the STORED
  row (never the client), guarded with `isPathInApplicationFolder`, and served
  `Cache-Control: private, no-store` (never a 302 to storage). Denials return
  **404** so which applications exist is not leaked.
- **DELETE** removes an object on applicant remove/retake.

`canActorAccessApplicationPhoto(actor, ownership)` in
`application-photos.server.ts` is the **single security decision** and is a pure
function so the boundary is unit-provable (`tests/unit/application-photo-access.test.ts`):

- **Manager** — in only when the application is attributed to them OR its
  property is one they can reach today (`accessiblePropertyIdsForManager`, the
  same union `fetchApplicationsForManagerUser` uses). This is what stops manager
  B from reading manager A's applicant's ID photo. Property access — not the
  frozen attribution stamp — is authoritative, so a transferred property still
  resolves to the current owner.
- **Applicant** — resident by authenticated session email, or guest by claimed
  email, must match the application's stored applicant email. **Reads never
  accept a guest** (a guest can't server-resume answers either; live capture
  uses the in-memory preview).
- **Admin** — always.

## Variant sanitisation

The ID-photo keys ride on the "Driver's license / ID" question's
`wizardFormKeys`; the income-proof key rides on the income question's. So the
existing disabled-key machinery hides them when the manager disables that
question AND strips them at submit for the short-term form (which disables both
by default). `sanitizeApplicationFormForListing` was extended to reset the
attachment shapes (single → `null`, list → `[]`), and `hasFilledWizardValue`
treats an empty list / null slot as unfilled. Coverage:
`tests/unit/validate-application-submit.test.ts`.

## Lifecycle deletion

Bytes are reclaimed when the applicant removes/retakes a photo and when an
application row is **hard-deleted** (`reclaimApplicationPhotos`, wired into the
manager-applications `delete` action). Photos are **retained** while the
application row exists — including after reject / soft-withdraw — because the
manager needs them to screen. Any purge-on-decision or time-based retention is a
deliberate product/legal decision, not assumed here.
