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

## The one route + the two authorization decisions

`/api/portal/application-photos` (`src/app/api/portal/application-photos/route.ts`):

- **POST `{action:"sign"}`** mints a Supabase **signed upload URL** after
  authorization; the browser downscales the image client-side (longest edge
  ≤ 2048px, JPEG q0.85, `prepareFileForUpload` in `application-photo-field.tsx`)
  and uploads **directly to Storage** with `uploadToSignedUrl` — the bytes never
  pass through the serverless function, so phone captures clear Vercel's ~4.5 MB
  body limit. The sign endpoint enforces the MIME allowlist + 15 MB cap
  (`validateApplicationPhotoUpload`, also run client-side), a per-application
  object quota (`MAX_APPLICATION_PHOTO_OBJECTS`), and a per-IP in-memory rate
  limit (per-instance, defense-in-depth). A **failed mint/upload surfaces a
  field-level error with Retry and never a reference** — a failure can never
  look like success.
- **GET** streams a stored photo. The storage path is resolved from the STORED
  row (never the client), guarded with `isPathInApplicationFolder`, served
  `Cache-Control: private, no-store` (never a 302 to storage), with the
  `Content-Disposition` filename re-sanitized at serve time. Denials return
  **404** so which applications exist is not leaked.
- **DELETE** removes an object on applicant remove/retake — **pending rows
  only** (see retention below).

Two pure decisions in `application-photos.server.ts`, both unit-provable
(`tests/unit/application-photo-access.test.ts`):

`canActorAccessApplicationPhoto(actor, ownership)` — **reads**:

- **Manager** — in only when the application is attributed to them OR its
  property is one they can reach today (`accessiblePropertyIdsForManager`, the
  same union `fetchApplicationsForManagerUser` uses). This is what stops manager
  B from reading manager A's applicant's ID photo. Property access — not the
  frozen attribution stamp — is authoritative, so a transferred property still
  resolves to the current owner.
- **Applicant** — resident by authenticated session email matching the stored
  applicant email. **Reads never accept a guest** (a guest can't server-resume
  answers either; live capture uses the in-memory preview).
- **Admin** — always.

`authorizeApplicationPhotoWrite({actor, row, setupToken, sessionEmail})` —
**writes (sign + delete)**:

- **No stored row → deny for everyone.** The draft must persist first; there is
  no unbounded upload path into arbitrary application ids.
- **Guest** — authorized ONLY by the row's unguessable **resident-setup token**
  (the one the guest application upsert mints and returns; the client remembers
  the latest via `rememberApplicationSetupToken` and the capture UI stays gated
  behind an inline hint until it exists). **Never by a claimed email**, and every
  write denial returns one identical 403 `"Not allowed."` — probing an id+email
  reveals nothing.
- **Decided (non-pending) row → immutable to everyone but admin** (retention).
- **Signed-in** — manager property access or authenticated-email applicant
  match, as for reads.

## Variant sanitisation

The ID-photo keys ride on the "Driver's license / ID" question's
`wizardFormKeys`; the income-proof key rides on the income question's. So the
existing disabled-key machinery hides them when the manager disables that
question AND strips them at submit for the short-term form (which disables both
by default). `sanitizeApplicationFormForListing` was extended to reset the
attachment shapes (single → `null`, list → `[]`), and `hasFilledWizardValue`
treats an empty list / null slot as unfilled. Coverage:
`tests/unit/validate-application-submit.test.ts`.

## Retention & deletion — Option A (captain decision, deliberate)

Photos are **retained while the application row exists**, including after
**Reject** and after resident self-**Withdraw** (both keep the row). There is
**no** auto-purge on a decision and **no** time-based purge — a rejected
applicant can raise a fair-housing / discrimination complaint months later and
the manager needs the record they actually decided on. Do not add a purge sweep
without a new captain decision.

Two invariants follow from that choice and MUST hold:

- **Deleting an application removes the BYTES, not just the row.** A hard delete
  is now the only thing that removes these images, so it calls
  `reclaimApplicationPhotos` (wired into the manager-applications `delete`
  action) to list + remove every object under the application's folder. The
  folder key is uppercased (`applicationPhotoFolderKey`) so upload-time and
  delete-time ids can't drift by case and orphan the files. Coverage:
  `tests/unit/application-photo-access.test.ts` (“an application delete removes
  the bytes”). Applicant remove/retake also deletes the replaced object — but
  only while the row is still **pending**; the API refuses destructive writes on
  a decided application for every actor except admin, so an applicant cannot
  strip the record after a decision. There is **no periodic orphan sweep** — an
  object left behind by a failed best-effort delete stays until the row's hard
  delete.
- **The applicant-facing copy is honest about retention.** Step 4 / step 7 say
  the photo is shared with the property manager for this application and **kept
  with the application record** — it does NOT imply deletion after a decision,
  because there is none.
