# Lease generation — agent notes

The lease-generation spec lives in `leases/`:

| File | What it is |
| --- | --- |
| `leases/lease-generation-manifest.json` | Master data manifest — document blueprint, merge fields, derived fields, fee validators. The spec. |
| `leases/disclosure-clause-rules.json` | The rules catalog. `trigger_field_dictionary` names every input a rule may read; each rule's `trigger_logic.field` refers to one of those names. |
| `leases/seattle/`, `leases/san-francisco/` | Sample leases per jurisdiction. |

Neither file is parsed at runtime yet. They are the contract the eventual rules
engine (`src/lib/lease-templates/`) will be built against.

## Disclosure trigger fields (shipped)

A disclosure rules engine cannot fire on data the product does not collect. The
manifest's `implementation_checklist` calls this out directly ("Add property
fields: year_built, rrio_registration_number, certificate_of_occupancy_date"),
and three `derived_fields` entries are annotated "not yet in PropLane".

Five building-level compliance inputs now exist on `ManagerListingSubmissionV1`
(`src/lib/manager-listing-submission.ts`). They are camelCased versions of the
`trigger_field_dictionary` names, so the rules engine can map a
`trigger_logic.field` onto a submission property with a single case conversion
and no translation table.

| Submission field | Type | `trigger_field_dictionary` name | Rules that read it | Trigger |
| --- | --- | --- | --- | --- |
| `yearBuilt` | `number \| undefined` | `year_built` | `fed-lead-paint` | `year_built < 1978` |
| `sharedUtilityMetering` | `boolean \| undefined` | `shared_utility_metering` | `ca-shared-utility` | `shared_utility_metering == true` |
| `hasPeriodicPestService` | `boolean \| undefined` | `has_periodic_pest_service` | `ca-pest-control` | `has_periodic_pest_service == true` |
| `certificateOfOccupancyDate` | `string \| undefined` (`YYYY-MM-DD`) | `certificate_of_occupancy_date` | `sf-coverage-determination` (input), `ca-ab1482-notice` (input) | not read directly — feeds the `is_rent_ordinance_covered` and `ab1482_exempt` decision trees |
| `rrioRegistrationNumber` | `string \| undefined` | `rrio_registration_number` | `seattle-rrio` | rule is `{"always": true}`; the number is the merge value, not the gate |

Naming note: the manifest's `merge_fields.premises` entry sources the RRIO number
from `property.rrioNumber`, while `trigger_field_dictionary` and
`implementation_checklist` both call it `rrio_registration_number`. The two
authoritative-name lists agree with each other, so the field is
`rrioRegistrationNumber`; treat `property.rrioNumber` in `merge_fields` as stale.

### Storage

No migration. `manager_property_records.property_data` is `jsonb`
(`supabase/migrations/20260428110000_manager_property_records.sql`) and the
submission rides inside it as `MockProperty.listingSubmission`, so an additive
optional field needs no schema change.

### UNKNOWN IS NOT "NO" — the load-bearing invariant

`normalizeManagerListingSubmissionV1` resolves every one of these to `undefined`
when unset or unparseable. It must stay that way.

`fed-lead-paint` gates the federal lead-based paint disclosure, which carries
civil and criminal exposure. A normalization that defaulted `yearBuilt` to any
number would make an unknown-age building evaluate as post-1978 and silently
suppress a legally required disclosure. The same reasoning applies to the two
booleans: they record only an affirmative `true`, because a defaulted `false`
asserts a fact about the property that the manager never told us.

**The rules engine must therefore treat an absent value as unknown and fail
toward disclosing, not toward silence.** `year_built < 1978` evaluated against
`undefined` is `false` in JavaScript — that is exactly the wrong answer, and the
engine has to handle it explicitly rather than relying on the comparison.

Normalization is also deliberately narrow: `yearBuilt` accepts only an integer in
1600..2100, `certificateOfOccupancyDate` only `YYYY-MM-DD`. Anything else becomes
`undefined` (unknown) rather than a stored value nobody can trust.

Coverage: `tests/unit/manager-listing-submission.test.ts` ("disclosure trigger
fields"), plus `tests/unit/listing-wizard-draft-autosave.test.tsx`, whose
fingerprint hashes the whole submission and therefore covers these fields
automatically.

### UI

A "Compliance details" subsection on the add-listing wizard's property-details
step (`src/components/portal/manager-add-listing-form.tsx`). Every field is
optional and none of them gate publishing — `listing-wizard-validation.ts` is
deliberately untouched.

`yearBuilt` carries plain-language helper text ("Homes built before 1978 need a
lead-based paint disclosure with the lease") with no statutory citation and no
legal advice. The RRIO input renders only when the address resolves to Seattle
via the existing `resolveLeaseJurisdiction` (`src/lib/lease-jurisdiction.ts` —
reused, not reimplemented), while the address is still blank, or whenever a value
is already stored, so a number a manager entered can never be orphaned behind a
hidden input.

These are internal compliance inputs, not marketing copy. Do not render them on
the public listing page.

### ⚠️ They DO reach the public payload today (pre-existing, not fixed here)

`src/lib/public-listings.server.ts:12-16` `asProperty` spreads `property_data`
with no allowlist, and the whole `ManagerListingSubmissionV1` is embedded on it
as `listingSubmission`. Verified against a running dev server:
`GET /api/property-records/public` already returns `wifiPassword`,
`wifiNetworkName`, `generalHouseInfo`, and the manager-only `houseDescription`
to anonymous callers. The five new fields will land in that same payload the
moment a listing is published with them.

That is a pre-existing allowlist gap owned by another workstream, not something
this change introduced, and it was left alone deliberately. It matters here
because `rrioRegistrationNumber` and `certificateOfOccupancyDate` are
public-record facts (low sensitivity) but `yearBuilt` plus the two booleans are
compliance posture — worth naming in that fix's allowlist decision.

## Manifest-named trigger fields deliberately NOT added

`trigger_field_dictionary` names 18 fields. Five are now collected. The rest were
left out on purpose:

**Derived from data PropLane already has — collecting them would create a second
source of truth.**

- `city` — `resolveLeaseJurisdiction()` already derives it from the address.
- `collects_deposit`, `has_nonrefundable_fee` — the manifest itself gives the
  expressions (`security_deposit_amount > 0`, etc.) over existing listing and
  application fields.
- `lease_start_date` — already on the application (`application.leaseStart`).
- `is_rent_ordinance_covered`, `ab1482_exempt` — outputs of decision trees, not
  raw inputs. `certificateOfOccupancyDate` is one of their inputs and is now
  collected; the trees themselves are still unimplemented.

**Not a building fact, so the listing submission is the wrong home.**

- `lease_negotiated_language` — per applicant/lease, belongs on the application
  or lease record. Gates `ca-translation`.
- `rent_increase_pct` — computed per rent-increase notice, not stored.

**Landlord actual-knowledge booleans — same shape as the two shipped booleans,
but out of scope for this change.** These are the obvious next batch:

- `in_flood_zone` — gates `ca-flood` and `wa-flood-disclosure`. Note the manifest
  wants `wa-flood-disclosure` gated on `lease_start_date > 2026-12-31`.
- `known_mold_hazard` — gates `ca-mold` / `wa-mold`.
- `known_ordnance_within_mile` — gates `ca-ordnance`.
- `death_within_3yr` — gates `ca-death-on-premises`.

If they are added, they must follow the same rule as the shipped pair: record an
affirmative `true` only, and never normalize an unanswered question to `false`.

## Execution evidence (P4)

A lease is binding because it was validly executed, and the electronic part was
already fine: a typed name plus the certificate satisfies ESIGN and state UETA.
What was missing was evidence of **what** was signed. The certificate recorded a
name and a timestamp; nothing tied a signature to a specific document, so there
was no way to prove which version a party agreed to. Everything below exists to
close that.

Owner files: `src/lib/lease-execution-evidence.ts`,
`src/lib/lease-pipeline-storage.ts`, `src/lib/lease-pdf-signing.ts`, and the
guard in `src/app/api/portal-lease-pipeline/route.ts`.

`lease-execution-evidence.ts` is deliberately PURE. Its only import from the
storage module is a type, so a server route can enforce the same rules without
pulling in 1700 lines of browser store. Keep it that way.

### Fields (fixed contract)

`portal_lease_pipeline_records` is
`(id, manager_user_id, resident_user_id, resident_email, property_id, status, row_data jsonb, created_at, updated_at)`.
The whole row lives in `row_data`, so **none of this needed a migration.**

On `LeasePipelineRow`:

| Field | Type | Written by |
| --- | --- | --- |
| `documentSha256` | `string \| null` | DERIVED (see below), never stored independently |
| `executedJurisdiction` | `string \| null` | a later agent. `"US-CA"` or `"US-CA/san_francisco"` |
| `templateVersion` | `string \| null` | a later agent. Template id plus semver, e.g. `"ca-residential@1.2.0"` |

On `LeaseSignature` (per party):

| Field | Type | Meaning |
| --- | --- | --- |
| `documentSha256` | `string \| null` | SHA-256 of the document **this** party was shown |
| `consentVersion` | `string \| null` | version of the consent text they accepted (`esign-consent-v1`) |

`row.documentSha256` is **derived on every normalize** from the first signature
that recorded one (`residentSignature ?? managerSignature`), never carried
forward from storage. It has to be: every path that resets a lease spreads
`...row` and nulls only the signature fields, so a stored copy survived the
document being replaced and the row re-signed, and the certificate then printed
a fingerprint matching no document anyone signed. A row with no signature has no
executed document, so the value is `null`.

Precisely, it is the hash recorded by the earliest signature that recorded one.
For a lease whose resident signed before this change (no hash) and whose manager
countersigns today, that is the manager's hash, not the first execution.

All five are optional, and `normalizeLeasePipelineRow` resolves an absent value
to `null`. A per-signature hash is validated as a real SHA-256 digest
(`asDocumentSha256`) before it is stored or rendered. `row_data` is
client-writable and the value is printed on a legal certificate, so
`"CAFEBABE"` must never render as a fingerprint. Likewise a `consentVersion`
only asserts consent when it matches the current constant.

A lease signed before this change has none of these fields and renders,
downloads, and displays exactly as before. **Do not backfill a guessed value.**
Absent means unknown, and unknown is honest.

`executedJurisdiction` and `templateVersion` are defined, threaded through
normalization and persistence, and left `null`. This agent does not resolve
jurisdiction; the fields are ready for the agents that will.

### When the hash is computed, and over what bytes

At **signature time**, never at generation time, in `residentSignLease` and
`managerSignLease` (`lease-pipeline-storage.ts`) via `leaseDocumentSha256`.
Each party's hash is taken from the pre-signature row.

That is the document the signer was shown, with one deliberate exception worth
stating plainly: on the PDF path the countersigning manager previews
`managerUploadedPdf.dataUrl`, which by then is the base document plus the
resident's certificate page, while the hash covers `originalDataUrl`. Both
parties therefore hash the same comparable bytes.

| Document | Bytes hashed |
| --- | --- |
| Generated lease | `row.generatedHtml`, UTF-8 encoded |
| Uploaded PDF | `managerUploadedPdf.originalDataUrl`, base64-decoded |

**The uploaded-PDF hash covers the ORIGINAL upload, not
`managerUploadedPdf.dataUrl`.** That field holds the copy with the signature
certificate page appended, which changes as each party signs, and a
certificate cannot contain a hash of itself. The certificate page is a platform
artifact; the agreement is the base document. The certificate says this in
plain words. Practical consequence: to verify independently, hash the
**original** PDF (or the generated HTML), not the merged download.

`sha256Hex` returns `null` when WebCrypto is unavailable (a plain-http dev
host has no `crypto.subtle`). A signature must never fail because hashing did;
an absent hash is recorded as absent.

### A document that changed between the two signatures

**Represented as a per-signature hash, not one row-level value.** Each
`LeaseSignature` carries its own `documentSha256`, so if the two parties signed
different bytes both facts survive instead of the second silently overwriting
the first. `row.documentSha256` reads the earliest of them, so the row-level
field never has to pick a winner between two disagreeing signatures.

When the two differ, `signedDocumentHashesDiverge(row)` is true and both the
HTML certificate block and the PDF certificate page print a warning naming each
party's own fingerprint. Through the portal this is now impossible (a signed
row's body is immutable, below), so it means an out-of-band edit reached the
record, exactly the case where the certificate must not pick a winner.

### Consent to transact electronically

`LeaseSigningModal` already required an affirmation that the typed name is a
binding signature, but not ESIGN's consent to **do business electronically and
receive records in electronic form**. `LEASE_ESIGN_CONSENT_TEXT` /
`LEASE_ESIGN_CONSENT_VERSION` (`lease-execution-evidence.ts`) are now the single
source: the modal renders that constant as its required checkbox, signing
records the version on the signature, and both certificates quote the text back
but only when the recorded version matches the current constant, so bumping
the wording can never make a certificate misquote an older signer.

**Not captured: IP address and user agent.** Attribution metadata needs a
server-side capture point; signing runs entirely in the browser through the
client storage layer, and a browser-reported IP is worthless as evidence.
Capturing it means routing signature writes through a route handler, which is
outside this agent's files. Flagged, not attempted.

### Signed documents are immutable in practice

**The server check is the one that matters.** `POST /api/portal-lease-pipeline`
stores whatever `row_data` the caller sends, so a browser-side guard on a
browser-owned store is advisory at best: anyone with devtools could POST a
rewritten executed lease. The route now loads the stored row and answers **409**
when the request would replace the document body of a row that still carries a
signature. It refuses rather than silently restoring, because a legitimate
client never makes that request, and it does not exempt admins. The point is
that executed text cannot change, not that only strangers may not change it.

`preserveSignedLeaseDocuments(prev, next)` (`lease-pipeline-storage.ts`) is the
client-side second line, applied in `write()`, `materializeLeasePipeline()`, and
the merge inside `syncLeasePipelineFromServer` (so a tampered server row cannot
land in memory and then *become* the body every later write preserves). It
reverts rather than throwing, and logs when it does. `write()` rehydrates from
session storage before comparing, because `ensureLeasePipelineScope` blanks
`memoryRows` on a scope change and an empty baseline would disable the guard,
and resident-side writes pass no scope at all.

Both sides share one predicate, `replacesSignedLeaseDocument`, so they cannot
drift.

Three deliberate exemptions:

- **The certificate merge.** Comparison is on the *base* document
  (`generatedHtml` and `managerUploadedPdf.originalDataUrl`), so appending the
  certificate page into `dataUrl` at signing is allowed. `refreshUploadedPdfSignatures`
  now pins `originalDataUrl` before the first merge. Without that, a legacy row
  carrying only `dataUrl` would have the certificate appended to an
  already-merged copy on the second signature, and the guard could not tell a
  merge from a swap.
- **Clearing the signatures.** Void, send-back-to-manager, renew, and amend all
  null the signatures; that is a superseding document, not a silent edit to an
  executed one, and it drops out of the guard by design.
- **Filling in an absent body on an `externallySignedLease` row.** That is how
  existing-resident onboarding files an already-executed off-platform PDF onto
  a row that never carried a document.

Coverage, both verified by deleting the guard and watching them go red:
`tests/unit/lease-pipeline-route-signed-document.test.ts` drives the real route
handler (manager and resident), and
`tests/unit/lease-signed-document-immutability.test.ts` drives the client store.

One related fix in `syncApprovedApplications`: the off-platform PDF is filed only
onto a row carrying no document at all. It used to key on `!managerUploadedPdf`
alone, so a manually-added resident whose manager then generated and signed a
lease in-portal would have the paper lease swapped in on every materialize, be
reverted by the guard, and churn forever instead of converging.

### Removed: `regenerateAllLeaseHtml`

Deleted. It rebuilt a fully executed lease from current data and replaced the
signed text **without bumping the version**, and it had zero callers anywhere in
the repo including tests and scripts. Its only possible future was destroying
evidence. Its one helper, `refreshAllLeaseApplicationSnapshots`, and the stub
`recomputeLeaseSignedHtml` (which returned `true` and did nothing) went with it
as dead code. Do not reintroduce a bulk regenerator that can reach a row with a
signature.

### Known gaps, for the agents that come next

- **The lease-pipeline route is guarded; other service-role writers are not.**
  `amendLeaseMoveOutDate` / `renewLease` write with their own client (they clear
  the signatures, so they are exempt anyway), and
  `runExistingResidentOnboarding` now refuses to upsert onto a lease row owned by
  another manager. Its `leaseId` is derived from the application axis id, the
  same id space real leases use, and the route falls back to a client-supplied
  `row`, so a colliding id could otherwise have replaced another manager's
  executed lease and re-parented it. That client-supplied `row` fallback is
  still an unscoped input and belongs to the onboarding lane to remove.
- **`deleteLeasePipelineRow` wipes a fully executed lease behind one
  `window.confirm`**, with no status gate. It clears the signatures in the same
  write, so it is outside the guard by construction. Not silent, so not fixed
  here, but "Delete lease" destroying an execution record with no archive is a
  product decision someone should make deliberately.
- **A renewal or amendment discards the superseded executed document.**
  `amendLeaseMoveOutDate` and `renewLease` (`src/lib/lease-amendment.server.ts`,
  not this agent's files) overwrite `generatedHtml` on a fully signed row while
  clearing the signatures. The manager asked for it and the new document is
  correctly unsigned, but the previously executed text and its signatures are
  gone. An archive of prior executions on the row is the fix; it needs the
  amendment lane's owner.
- `executedJurisdiction` and `templateVersion` are null on every row until
  someone populates them at generation time.
- Rows seeded as `externallySignedLease` carry synthetic signatures and no hash.
  That is correct (nothing was executed through the portal), but it means a
  present signature does not imply a present fingerprint.

# Lease templates are private (Jul 2026)

A manager-uploaded lease template is the manager's own legal document — often
their attorney's work product, carrying their entity details and their terms.
It is not listing marketing. Two independent things used to make it public;
both are closed.

## What was confirmed empirically, before any edit

Against the dev/test project, with the dev server running:

- `GET /api/property-records/public` returned **17 listings, every one carrying
  the full `listingSubmission` blob** — `getPublicListings()` spread
  `property_data` with no field allowlist. 64.5 KB of manager-owned JSON to
  anonymous callers.
- **5 of those listings published `wifiPassword`** (`AxisHome-5G` /
  `welcome-home-2026`) in that payload. The reported lease-template leak is one
  symptom of a wider "the whole submission is public" defect, not the whole bug.
- `listing-photos` is **public** and its objects are anonymously readable
  (`ANON GET 200 image/jpeg` on an existing object with no credentials). Note the
  live bucket has `allowed_mime_types: null` and `file_size_limit: null` — the
  values in `20260504120000_listing_photos_bucket.sql` never applied because the
  bucket pre-existed and the insert is `on conflict do nothing`. So the migration
  appears to restrict uploads to images/video, and in reality PDFs upload fine.
- **No live dev listing currently holds an uploaded template**, top-level or
  inside `propertyLeaseTemplates[]` — so the leak was structural and live, but
  had no realized instance in dev. Production was not checked (its credentials
  live only in Vercel, by design). See "Legacy objects" below.
- A second anonymous route, `GET /api/public/property-lead?propertyId=…`, reached
  the same stored blob the same way. Fixing only `getPublicListings()` would have
  been bypassable by asking for a property by id.

Also found while tracing, both fixed here:

- Only the create-listing wizard ever uploaded a template. The three lease
  modals (`manager-lease-editor-modal`, `property-lease-form-modal`,
  `property-lease-upload-modal`) persisted the **base64 `data:` URL straight
  into `manager_property_records.property_data`** — a multi-megabyte PDF inlined
  into the blob public surfaces read.
- Neither the wizard's uploader nor `collectSubmissionMediaUrls` walked
  `propertyLeaseTemplates[]`, so per-property templates were never uploaded and
  never garbage-collected.

## Part 1 — the public payload is an explicit allowlist

`publicListingProjection` in `src/lib/public-listings.server.ts` is now the ONE
projection every anonymous read runs through: `getPublicListings()` (which backs
both `/api/property-records/public` and the AI housing-search + leasing SMS
tools, so "what the search sees" still cannot drift from "what the AI sees") and
`/api/public/property-lead`.

Deny by default, at every depth: `PUBLIC_PROPERTY_KEYS` for `MockProperty`,
`PUBLIC_SUBMISSION_KEYS` for the submission, and per-row lists for rooms,
bathrooms, shared spaces, bundles, quick facts and custom fees. Each list is
`as const satisfies readonly (keyof T)[]`, so a renamed field fails the build
rather than silently dropping out of the payload.

The rule for adding a field: it belongs on a list when a prospect-facing surface
reads it, or it is pure listing marketing metadata. It stays off when it is
manager- or resident-internal — access credentials and instructions (wifi,
`moveInInstructions`), lease configuration, billing policy, add-on service
offers (which carry `residentEmails`), proration internals. A compliance field
like `yearBuilt` added next month is public only when someone adds it here.

**`listingSubmission` is still present in the payload, allowlisted, not
removed.** Removing it outright fails the "browse, listing detail and the apply
wizard still work" requirement: the public apply wizard reads its custom
application questions, fee sheet and lease terms from it, and
`listing-rich-from-submission.ts` calls `.trim()` / `.map()` on the required
fields unguarded — a missing one throws into `getListingRichContent`'s catch and
silently renders a **generic demo listing** in place of the real one. Every
required submission field is therefore on the allowlist (they are all benign
listing copy or pricing), and `tests/unit/public-listing-projection.test.ts`
asserts that.

## Part 2 — the object

New PRIVATE bucket `lease-templates`
(`supabase/migrations/20260728120000_lease_templates_bucket.sql`): 8 MB,
`application/pdf` only, **no storage policy at all**, copying
`application-documents` rather than `manager-documents`. Storage RLS default-denies
`anon`/`authenticated` when no policy grants them, so the shipped public anon key
cannot reach the objects even though the PostgREST surface is browser-reachable.
A folder-scoped `auth.uid()` policy would be strictly weaker here, because a
resident who may read their own lease template is not the folder owner. Like
`application-documents` there is no metadata table — the object path lives on the
submission, so it persists through the same autosave path as every other listing
field and ownership is re-derived at request time.

**Path convention:** `<manager user id>/<timestamp>-<rand>.pdf`. The folder is
the authenticated uploader's id, never a name from the request.

**Stored reference:** `leaseTemplateDocUrl` holds
`/api/portal/lease-template?path=<object path>` — a stable, root-relative URL
onto the authorizing route, **not** a signed storage URL. That is deliberate and
it is the one place this deviates from the documents module:
`buildManagerTemplateLeaseHtml` (`generated-lease.ts`) bakes the value into a
persisted `<object data=…>` inside `portal_lease_pipeline_records.row_data.generatedHtml`,
which outlives any signed-URL TTL by years. A stable URL that re-authorizes on
every request gives the same privacy guarantee without touching the lease
router, the signing modal, or the generated HTML. Root-relative so the same
stored value resolves on localhost, previews, production, and inside the
Capacitor WebView, including from the `srcDoc` iframes that render leases.

**`GET /api/portal/lease-template?path=…`** streams the bytes (service-role
`download()`, `Cache-Control: private, no-store`, `X-Content-Type-Options:
nosniff`), the same shape as `/api/portal/application-photos` — not a 302, which
the documents module already learned opens a new tab in the Capacitor WebView
instead of rendering. Authorization is by RELATIONSHIP, not portal role, so a
multi-role account is judged on each relationship it actually holds:

1. the manager who uploaded it, by the object's own folder;
2. the OWNING manager of a property whose submission references that exact path,
   re-derived from `manager_user_id` and deliberately NOT from the folder — the
   two genuinely differ, because a co-manager's upload lands in the co-manager's
   folder while the URL is stored on the owner's listing, and a transferred
   property changes hands without moving any object;
3. a co-manager with the `properties` module on such a property;
4. the APPROVED resident of such a property. Approval is checked explicitly
   (`residentHasApprovedResidency`) because `resolveResidentFilingScope` falls
   back to unapproved rows, which would hand the grant to anyone who merely
   applied to a live listing. `/api/portal/resident-property` draws the same
   line — it strips `listingSubmission` for an unapproved applicant — and the
   two routes must not disagree about one trust boundary;
5. either party to a lease document that already embeds the path. Required
   because the generated lease HTML bakes the URL in permanently and is never
   rewritten: when a manager REPLACES a property's template the listing stops
   referencing the old object, and without this branch every resident who
   already signed against it would 404 on their own lease — something the old
   public URL never did.

Membership is **two** conditions, and both are load-bearing: a property (or
lease row) must reference the path AND the object's FOLDER OWNER must be someone
who could have attached it there — the row's own manager, or a co-manager of it.
"A property I can see references this path" alone is not authorization, because
`leaseTemplateDocUrl` is a manager-editable blob field: a manager can write any
string onto their OWN listing and the wizard mirrors `property_data` verbatim,
so without the second condition they could paste another manager's path onto
their own property and read the document back. The folder id is not secret
either — `managerUserId` ships in the public listing payload — so the path is a
weak secret and never the gate. The same pair applies to the lease-row branch,
since a lease row is client-writable too. Every denial is a 404, never a 403, so
the route never confirms a path exists. `POST` (multipart) uploads into the
caller's own folder after a manager/admin role check and a per-user
`rateLimit` — an uploaded object carries no property association, so nothing
else bounds how many a manager can push into a free-plan storage budget.
`DELETE` removes only paths whose folder is the caller's id.

**Writes funnel through one function.** `readLeaseTemplateFile`
(`lease-config-form.tsx`) is the single picker all three lease modals use; it now
uploads and hands back the route URL instead of a `data:` URL, so fixing it
fixed all three. `/demo` keeps the in-memory data URL (it must never write real
rows). A failed upload surfaces a toast and stores nothing — base64 is never
persisted as a fallback. The wizard's `uploadSubmissionMedia` routes the
template (and every `propertyLeaseTemplates[]` entry) through
`uploadLeaseTemplateDataUrl` instead of the generic `uploadOne`, so a legacy
draft resumed with base64 lands in the private bucket rather than the public
photo bucket.

**Deletion still reclaims, and still skips.** `deleteSubmissionMediaObjects`
calls `deleteSubmissionLeaseTemplates` with the same `stillReferencedBy` set, so
a path a surviving submission references is left alone — the shared-object rule
from the property-drafts notes in AGENTS.md, which matters most for the two draft
rows a partially-failed id re-key leaves behind. `collectSubmissionMediaUrls`
still pushes `leaseTemplateDocUrl` and now walks `propertyLeaseTemplates[]`,
which is what reclaims a LEGACY template still sitting in `listing-photos`.

## The projection and the manager's own catalog share one localStorage map

`cachePublicExtraListings` (`demo-property-pipeline.ts`) writes every public
fetch into `axis_manager_extras_by_user_v1` keyed by `managerUserId` — the SAME
map the manager portal reads, edits, and mirrors back into `property_data` via
`updateExtraListingFromSubmission`. That was harmless while the public payload
equalled the stored blob. The allowlist made it lossy: one visit to
`/rent/browse`, or a native app launch (which hydrates the public catalog for
every role), would replace the owner's own row with the stripped copy, and their
next House-details save would persist it — silently destroying lease config,
wifi, add-on services, room move-in instructions, and the lease template this
whole change exists to protect.

The cache now **merges**: public scalar fields refresh, but an existing row's
`listingSubmission` is never downgraded. Residual, accepted: a listing cached
for the first time from the public route before the owner's authoritative sync
runs (TTL 15s) is a projection until that sync fires. Coverage:
`tests/unit/public-listing-cache-merge.test.ts`. If you add another consumer of
the public payload, ask whether it writes anywhere the owner later saves from.

## Legacy objects: read-through, knowingly, with a backfill plan

**Decision: read-through.** Templates already in `listing-photos` keep working;
only new uploads go private.

Why, rather than a backfill:

- Dev holds **zero** of them (verified above), so a backfill there is a no-op.
- The Part 1 allowlist already removes the only discovery path — a legacy URL is
  no longer emitted by any anonymous endpoint.
- A backfill cannot stop at the submission. Every already-generated lease has the
  old public URL **frozen inside `generatedHtml`**, so deleting the public object
  breaks the document residents already signed. A correct backfill must rewrite
  `portal_lease_pipeline_records.row_data.generatedHtml` too, which is the lease
  and signing flow this change deliberately does not touch.

Residual risk, stated plainly: a legacy object stays anonymously readable to
anyone who already has its URL. Check production before deciding it is empty:

```js
// service-role, against the target project
const { data } = await db.from("manager_property_records").select("id, property_data");
for (const r of data) {
  const s = r.property_data?.listingSubmission ?? {};
  for (const u of [s.leaseTemplateDocUrl, ...(s.propertyLeaseTemplates ?? []).map(t => t?.leaseTemplateDocUrl)])
    if (typeof u === "string" && u.includes("/object/public/listing-photos/")) console.log(r.id, u);
}
```

If that prints rows, the backfill is: copy each object into `lease-templates`,
rewrite the submission URL, rewrite every `generatedHtml` containing the old
URL, then remove the public object — in that order, so a failure never strands a
lease pointing at nothing.

## The agent tool could re-open the hole one property at a time

`update_property_lease_config` (`src/lib/tools/domains/properties.ts`) accepted
a model-supplied `leaseTemplateDocUrl` and wrote it to `manager_property_records`
verbatim, with no scheme or host validation. It is behind the write-tool confirm
gate, but the preview rendered only the file NAME — so the human approving it
could not see what they were attaching. Applicant-submitted text is untrusted
(AGENTS.md), so a prompt injection could steer the model into proposing a
third-party URL or a base64 `data:` PDF behind a benign label and substitute the
document residents sign.

`validateLeaseConfigInput` now accepts only a value that resolves to a stored
object — `leaseTemplateObjectPath()` (private bucket) or `listingMediaObjectPath()`
(a legacy `listing-photos` template a property may still carry and legitimately
re-apply) — and the preview carries the resolved path as a "Stored file" field.
`data:` URLs and arbitrary links are rejected. Switching a property to
`axis_default` / `custom_comments` is untouched.

`leaseTemplateObjectPath` is anchored (`startsWith`), not a substring match: a
loose match would let `https://evil.example/api/portal/lease-template?path=…`
resolve to a real object path, which both this validation and the read route's
membership check would then have treated as genuine.

Two mitigations that already held, so this was never XSS: `escapeHtml`
attribute-escapes the URL in `generated-lease.ts`, and every lease iframe is
sandboxed without `allow-scripts`.

## Coverage

- `tests/unit/public-listing-projection.test.ts` — secrets dropped at any depth,
  a newly added field is not published, every load-bearing field survives.
- `tests/unit/public-listing-cache-merge.test.ts` — caching the projection never
  downgrades the owner's stored submission, but still refreshes public fields.
- `tests/unit/lease-template-storage.test.ts` — path round-trip, traversal
  rejection, nested `propertyLeaseTemplates[]` collection, deletion skips a path
  a survivor references.
- `tests/integration/portal/lease-template-access.test.ts` — anonymous denied,
  folder owner served, property owner served when a co-manager uploaded it,
  co-manager served, approved resident served only when their property
  references the path, PENDING applicant denied, a resident whose signed lease
  embeds a no-longer-referenced template still served, a different manager
  denied, a manager who planted another manager's path on their own listing or
  in their own lease row denied, traversal rejected before storage is touched,
  `DELETE` scoped to the caller's own folder.
- `tests/unit/lease-template-storage.test.ts` also asserts a foreign URL merely
  containing the route resolves to null.
