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

---


## The document is chosen client side, in one place

Generation is fully browser side. There is no API route in the path:

```
manager-leases-pipeline-panel.tsx  runGenerateLease(row)
  -> lease-pipeline-storage.ts     generateLeaseHtmlForRow()
       -> generated-lease.ts       leaseContextFromApplication()  (builds LeaseGenerationContext)
       -> generated-lease.ts       buildAiGeneratedLeaseHtml(ctx)
            -> buildManagerTemplateLeaseHtml   when the manager uploaded a template (returns FIRST)
            -> build{Seattle,SanFrancisco,California,Washington}LeaseHtml -> buildLeaseHtml(ctx, config)
```

`buildLeaseHtml` then picks the short-term agreement or the long-form lease.

## Stay pricing: one resolver, two consumers (Jul 2026)

### The bug

A manager reported that short-term / daily rentals were billed correctly but received the
wrong lease document, or none. There were **four** unrelated "daily rate" fields and no two
of them agreed:

| Field | Read by |
| --- | --- |
| `room.rentBasis:"daily"` + `room.dailyRentPrice` | charges, and only for **non**-short-term applications |
| `sub.shortTermDailyCost` (string) | the short-term **document** and the short-term **charges** |
| `bundle.shortTermNightlyRent` | the listing price label only. Never charges, never the lease |
| `room.prorateMethod:"daily_rate"` + `dailyRentRate` | proration of the edge months of a MONTHLY room. Unrelated, do not conflate |

### Reproduction observed (scripted, `tests/unit/stay-pricing-repro.test.ts`)

Driving the real `recordApprovedApplicationCharges` and `buildAiGeneratedLeaseHtml` on one
fixture (a $55/day room in Fremont CA, an 11-day stay), before the fix:

1. Daily room, short-term rentals **unticked**: the ledger billed **$605.00** correctly, but
   the document was the long-form residential lease quoting `$1200.00 / month` in Exhibit A.
   Right charge, wrong number. Such a placement still takes the long-form lease (see the
   `shortTermRentalsAllowed` gate below) — it now quotes `$55.00 / day`.
2. Room `$55/day` vs listing `shortTermDailyCost` `$40`, explicit short-term application: the
   ledger billed **$440.00**, the listing rate. Both sides ignored the room.
3. Listing short-term fields blank: the document rendered `— per day` and `—` for both totals.
4. Uploaded template + daily room: `<th>Monthly rent</th>` above the value `$55.00 / day`.
5. Fremont CA: the header claimed "City and County of San Francisco" and the document carried
   the SF Rent Ordinance paragraph, because any bare `ca` resolved to `san_francisco`.
6. Monthly room: unchanged. This is the regression baseline and it passed before and after.

### `resolveStayPricing` (`src/lib/room-pricing.ts`)

The single decision point. The lease document and the charge ledger both call it, so they
cannot quote different numbers for the same resident.

Precedence, in order:

1. **`rentalType === "short_term"` wins the kind outright.** Short stay, daily basis. The ROOM
   the applicant selected supplies the rate; `sub.shortTermDailyCost` is the fallback.
   A negotiated monthly rent deliberately does **not** apply here: the short-term charge branch
   does not consult `managerRentOverride` either, and letting the document do so would recreate
   the disagreement this resolver exists to remove.
2. **Negotiated monthly rent** (`managerRentOverride`, then `signedMonthlyRent`) beats the
   room's daily basis, exactly as it already beat the room's listing monthly rent. Mirrors
   `residentNegotiatedMonthlyRent` in `household-charges.ts`.
3. **A room priced by the day is a short stay ONLY when BOTH gates pass**: the listing's
   `shortTermRentalsAllowed` is ticked, AND `isIntraMonthStay(leaseStart, leaseEnd)`
   (`intraMonthStaySpan`, `short-term-stay-pricing.ts` — the same function the ledger uses),
   which is exactly when the charges settle as ONE up-front stay total.

   **Both gates are load-bearing, do not remove either.**

   - *The duration bound.* `rentBasis:"daily"` is a BILLING BASIS, and AGENTS.md defines it as
     a supported way to bill a normal tenancy (first month, each recurring month, partial last
     month). Gating the document type on the basis alone handed a 12-month daily-priced
     resident a lodger agreement that disclaims tenancy, drops the federally required
     lead-paint disclosure, deposit-return terms, entry notice and Addenda A-E, and states a
     single up-front total the ledger never bills. With unknown or open-ended dates the
     resolver returns `"long"`: the expensive mistake is giving a real tenant a document that
     denies their tenancy.
   - *The `shortTermRentalsAllowed` tick.* The short-term document asserts
     `Owner-Occupied Residence` in its header and `Owner/Host lives on or controls the
     property` in Section 10, and disclaims tenancy. A billing-basis flag plus two dates
     establishes none of that, so an EXPLICIT manager signal is required before the lodger
     document can render. **This deliberately overrides the original task brief**, whose
     acceptance criterion said an unticked listing should still produce the short-term
     agreement; the user reviewed the finding and chose the override, because asserting
     owner-occupancy on the strength of a pricing flag is a legal claim the data does not
     support. An unticked daily-priced listing now gets the full residential lease, which is
     safe because that lease quotes the daily rate (see "The long form is daily-aware" below).
   - `rentalType === "short_term"` is itself an explicit declaration, so clause 1 above still
     wins outright regardless of either gate.

   `basis` stays `"daily"` in every outcome, so rent labels follow the real rate either way.
4. Otherwise the room's monthly rent. Byte-identical to legacy behavior.

**`stayKind` chooses only the DOCUMENT; it never moves a charge.** The ledger's `dailyBasisRate`
path is keyed on the room, not on `stayKind`, so flipping the tick changes which agreement
renders and nothing about what the resident owes. `tests/unit/daily-rent-charges.test.ts` is the
guard and passes unmodified.

### The long form is daily-aware

Because a daily-priced room is now routed to the residential lease far more often, that branch
consumes `stay` too. When `stay.basis === "daily"`:

- the rent figure is the daily rate (`$55.00 / day`), and every rent label follows the basis
  (`Daily base rent`, never `Monthly base rent` over a per-day figure), in Section 4 and in
  Exhibit A;
- the **Total monthly payment** row is omitted. Adding a per-day rate to a monthly utilities
  figure is meaningless, and `DAILY_RENT_MONTH_ESTIMATE_DAYS` is display/sort-only and must
  never reach a lease. A prose sentence states the real rule instead: each month bills the
  actual days of the term in that month × the daily rate, and utilities are prorated for a
  partial month;
- Section 5 renders as **Prorated Utilities**, not **Prorated First Month**. Only the RENT half
  is suppressed (prorating a monthly rent would read `55` as a monthly figure, and every month
  already bills by real days). Utilities are still a monthly estimate that the ledger prorates,
  so suppressing the whole section left that undisclosed while the Section 4 prose asserted the
  opposite. `proratedBlock` has one implementation with two modes (`utilitiesOnly`), and the
  utilities mode mirrors `leaseFirstPeriodProration` exactly — including the intra-month
  collapse (an intra-month daily lease prorates across the WHOLE term, not from lease start to
  month end) and the `daily_rate` / `dailyUtilitiesRate` branch. The amount is passed in as the
  ledger's billable monthly utilities, never parsed back out of the display label.
  Coverage: `stay-pricing-repro.test.ts` case 15;
- a month-to-month surcharge is NOT folded into the rate (that would print a daily rate $25 too
  high); it stays its own monthly line.

**The deposit keys on `rentalType`, not on the resolved `stayKind`.** That asymmetry is
deliberate and load-bearing: only an explicit short-term application is charged
`sub.shortTermDeposit`; a daily-priced room on a standard application is charged
`sub.securityDeposit`. The document has to quote whichever one the ledger will actually bill,
so it follows the same key. The move-in fee in the short-term document follows the same rule
(`shortTermMoveInFee` vs `moveInFee`), and utilities are added to the stay total only for a
standard application, because an explicit short-term nightly rate is all-in.

`managerSecurityDepositOverride` beats both, and a NON-EMPTY override wins even when it parses
to zero (`overrideMoney`, mirroring the ledger's `savedAmount`). Treating "0" as absent made a
waived deposit fall back to the listing default, so the document printed a deposit the ledger
never charged.

**`leaseStart` / `leaseEnd` are REQUIRED, not decorative.** They feed `isIntraMonthStay`, which
is half the gate in clause 3, so a new call site that omits them silently resolves `"long"` and
renders the full residential lease for a real short stay — with no test failure, since every
existing test passes dates. Failing to `"long"` is the safe direction, not a correct one.

Night counting stays in `shortTermStayNightCount` (`short-term-stay-pricing.ts`), the one
implementation the ledger bills from. `build-lease-html.ts` used to re-implement it inline with
bare `new Date("YYYY-MM-DD")`, which parses as UTC and could land a day away from the charges.

`room-pricing.ts` must **never** import `generated-lease.ts`, which imports it. It may import
`parse-money` and `short-term-stay-pricing` (both verified acyclic).

### One rule, one implementation — the three dedups

A resolver that both sides call is worthless if either side can feed it different inputs, so
the inputs are shared too. Never re-add a second copy of any of these.

| Rule | The ONE implementation | Was duplicated in |
| --- | --- | --- |
| Is this lease a single intra-month billing span? | `intraMonthStaySpan` (`short-term-stay-pricing.ts`) | a private `intraMonthLeaseSpan` in `household-charges.ts` |
| Which room of the submission is this application on? | `resolveSubmissionRoom` (`listing-room-resolution.ts`) | inline chains in `household-charges.ts` and `build-lease-html.ts` |
| What is this room's rent line? | `submissionRoomRentLabel` (same module) | `findSubmissionRoomRent` / `submissionRoomRentFromChoice`, once in `generated-lease.ts` (daily-aware) and again in `build-lease-html.ts` (monthly-only) |

**`resolveSubmissionRoom` precedence**: room-choice ids in the order given → unique
`signedMonthlyRent` match → unit-label name match (exact, then partial) → the only room → the
only `daily_rate` room. The exact rent figure deliberately outranks the fuzzy label substring
match. Callers pass an ALREADY-NORMALIZED submission.

**Both consumers must pass the SAME inputs, including `unitLabel`.** One shared implementation
fed two different argument sets is still two answers: while the ledger passed no label and the
label outranked the signed rent, an application whose `roomChoice1` carried no `listingRoomId`
resolved to the label-matching room in the document and the rent-matching room in the ledger —
two rooms, two rates, the original bug. The ledger now passes its listing property's
`unitLabel`. Coverage: `stay-pricing-repro.test.ts` case 16.

Two knock-on notes in `build-lease-html.ts`: `wholeHome` is now derived from the LISTING
(`isEntireHomeListing` / no named rooms) rather than from "no room record resolved", because the
shared chain can match a single unnamed room on an entire-home listing; and the whole-home label
is checked before the room name so entire-home premises still read `Entire home`.

**Money-path behavior change from the span dedup:** the ledger used to split lease dates strictly
on `-`, so a non-ISO date (which `manualResidentDetails.moveInDate` / `moveOutDate` can
legitimately be, e.g. `3/10/2026`) silently fell out of the intra-month collapse and was billed a
first-month AND a last-month charge for the same days. Both sides now parse through
`parseFlexibleLocalDate`, so such a lease collapses to one charge. Coverage:
`stay-pricing-repro.test.ts` case 14.

**Money-path behavior change from the DST-safe night count:** `shortTermStayNightCount` is what
the ledger bills `stay_total` from, and it used to be
`Math.ceil((end - start) / 86_400_000) + 1` on raw local timestamps. A span crossing a
daylight-saving fall-back gains an hour, which pushed the `ceil` up a whole day and billed an
extra night. `calendarDaysBetween` now normalizes both ends to UTC midnight before dividing, so
a 2026-11-01 → 2026-11-10 stay at $80/night in US/Pacific bills **10 nights / $800** where it
previously billed 11 / $880. The new count is the correct one, but it reprices existing
fall-back-crossing stays on regeneration.

### Utilities on a stay follow the ledger's two branches

`rentBasis: "daily"` and `prorateMethod: "daily_rate"` are independent per-room fields that
AGENTS.md says coexist. The ledger prorates a stay's utilities as
`billableDays × dailyUtilitiesRate` when the room has `prorateMethod === "daily_rate"` and a
positive `dailyUtilitiesRate`, and as `monthlyEstimate × (billableDays / daysInMonth)` otherwise.
The short-term document's `Utilities estimate` row implements the same two branches, or its
`Total due` disagrees with the charges for any room carrying both fields.
Coverage: `stay-pricing-repro.test.ts` case 11.

### The lease states the deposit OBLIGATION, never the running balance

The approval charges bill `Math.max(0, securityDeposit - paidHoldingDepositCredit)`, which is a
different number from the deposit the lease agrees to. **Do not try to close that gap by
printing the net on the document.** An earlier pass did, by threading a
`LeaseGenerationContext.holdingDepositCreditUsd` read from the charge store, and that re-created
the exact mismatch class this whole change exists to remove: the credit was snapshotted at
document-generation time and again at charge-generation time, and the two orderings disagree.
Generate the lease before the holding deposit is paid and it permanently overstates the deposit
(`generateLeaseHtmlForRow` refuses to rebuild once the lease carries a signature); generate it
after and the reverse. Persisting a snapshot on the pipeline row does not fix it either — it
adds a persisted field, couples lease generation to the charge store, and keeps the ordering
window.

The document therefore quotes the **gross deposit**, which is fixed at signing, plus a standing
sentence (`HOLDING_DEPOSIT_CREDIT_NOTE` in `build-lease-html.ts`) stating that any holding
deposit already paid is credited against it on the resident's ledger. That sentence is true
whether or not a credit exists, so no ordering can falsify it. It renders on both branches,
beside the deposit table.

**The charge ledger and the Payments surface remain the sole authority for the net balance**, and
they were already correct. Coverage: `stay-pricing-repro.test.ts` cases 12 and 13 — 12 generates
the same lease before and after a holding-deposit payment and asserts the documents are
byte-identical while the ledger's `security_deposit` charge drops to the net.

### Executed short-term clauses added in this change (user-approved)

These are new contract terms a guest signs, not a pricing change, and they were approved
explicitly and separately from the stay-pricing work (Jul 2026):

- **8. Revocation of Permission** — permission-based occupancy, revocation for enumerated
  conduct, and law-enforcement removal after check-out.
- **9. Damages and Liability** — guest liability for damage beyond ordinary wear, and a
  limitation of the host's liability for the guest's belongings.
- Section 5 retitled **Purpose of Stay → Lodger Status**.

Every obligation and every liability limitation in those sections carries an explicit
"to the extent permitted by applicable law" qualifier plus a non-waiver sentence, so nothing
reads as an unqualified waiver of a resident's statutory rights. No statute is cited.
**Any future edit to executed-contract wording needs the same explicit approval.**

### Charge path change, and its live-data consequence

`household-charges.ts` now resolves the room **before** the short-term branch (it used to
resolve it after, so the branch was structurally unable to see the room) and prices the stay
through the resolver.

**Behavior change on a money path:** a listing carrying both a room `dailyRentPrice` and a
listing `shortTermDailyCost`, with an explicit short-term application, now bills the room's
rate where it previously billed the listing's. That is the intended correction (the room the
applicant selected is the authority for its own price), but a regeneration on such a row will
move the amount.

### A future-dated lease was billed twice for its move-in month (fixed)

Found by the document-vs-ledger invariant test, pre-existing and NOT specific to daily rooms.

`syncAllRecurringRentCharges` looked one month ahead (`monthsToGenerate.add(nextMonth)`) with
no floor. A recurring profile's `startMonth` is deliberately the month AFTER move-in
(`firstRecurringMonthAfterLeaseStart`) because the move-in month is already covered by the
upfront first-month/prorated charges. For any lease starting in a future month, `nextMonth`
was therefore EARLIER than `startMonth`, and the pass generated a second `rent` row for the
month the upfront charge had already billed. An 11-day $55/day stay came to $2,612.90 instead
of $1,847.58.

It only ever reproduced for a future-dated lease, which is why the existing suites missed it:
they all use past fixture dates, and past months are never generated. The guard is now
`if (nextMonth >= profileStartMonth)`. Coverage: `stay-pricing-repro.test.ts` cases 9 and 10,
both of which derive their dates from the clock so they stay future-dated forever.

## Legal guardrails

**Never author, infer, or paraphrase a statute citation.** A plausible-looking wrong citation
on an executed lease is the worst thing this module can produce.

- **There is no lodger statute anywhere in this repo.** `leases/disclosure-clause-rules.json`
  was checked: no `1946.5`, no `lodger`, for either CA or WA. The short-term document's
  **Lodger Status** section therefore renders `config.shortTermPurposeParagraph` unchanged, so
  Washington keeps its existing RCW 59.18.040 reference and California cites nothing.
  **Open gap for the next wave:** if a verified CA lodger citation (Cal. Civ. Code 1946.5 is
  the likely one) is added to `disclosure-clause-rules.json` with `cite_verified: true`, add an
  optional `shortTermLodgerStatuteRef` to `LeaseJurisdictionTemplateConfig` and render it in
  that section. No such field was added here, because it would have carried zero values.
- **`leases/disclosure-clause-rules.json` is reference material and is never parsed at
  runtime.** `leases/lease-generation-manifest.json` still lists wiring it into the section
  renderer as a TODO. `build-lease-html.ts` hardcodes its own disclosures.
- Two hardcoded Washington citations used to print on **every** California lease
  (`Landlord responsibilities (RCW 59.18.060)` and Addendum C's `(RCW 59.18.130)`). They sat
  outside the `config` mechanism. Both are now routed through config rather than deleted,
  because deleting them stripped a CORRECT citation from every Washington lease:
  - Addendum C uses the existing `residentMaintenanceStatuteRef` (already RCW 59.18.130 for
    WA, "California Civil Code" for CA). No new field.
  - The landlord-duty heading uses a new **optional** `landlordMaintenanceStatuteRef`, set to
    RCW 59.18.060 for Seattle and Washington and deliberately **unset** for California and San
    Francisco, where it renders with no citation. Nothing was authored: RCW 59.18.060 was
    already in the file. Populate the CA side only from a verified source.

## Jurisdiction resolution: city match first, then statewide

`resolveLeaseJurisdiction` (`src/lib/lease-jurisdiction.ts`) regex-matches the property address.
It resolves five values: `seattle`, `san_francisco`, `california`, `washington`, `unsupported`.

The two statewide values were added because the state rules used to fall through to the CITY
templates, so a Fremont CA property generated a lease claiming "City and County of San
Francisco" and citing the SF Rent Ordinance. Explicit city names, the Ave NE street pattern,
the Oregon exclusion, and the 981xx / 941xx ZIP rules all still run first and are unchanged, so
Seattle and San Francisco resolve exactly as before.

`CALIFORNIA_LEASE_CONFIG` and `WASHINGTON_LEASE_CONFIG` live in their own modules
(`lease-templates/california.ts`, `washington.ts`) rather than in `types.ts`. Each is the
matching city config with every city-specific claim **removed**: no
`municipalComplianceParagraph`, a state-only `headerSubtitle`, and a governing-law paragraph
without the city-ordinance clause. Every statute reference carried over is already state level
(RCW chapter 59.18, California Civil Code), so no citation was authored.

## Jurisdiction-specific numeric terms

Three figures used to be hardcoded in the long-form body with Washington values, so every
California lease printed a WA notice period, a WA deposit-return window, and a WA minimum
heat temperature. They are now OPTIONAL config fields
(`monthToMonthTerminationNotice`, `depositReturnWindow`, `minimumHeatTemperature`),
populated for Washington and Seattle from the values that were already in the repo and
deliberately UNSET for California and San Francisco, where they fall back to language that
asserts no figure at all ("as required by applicable law").

That asymmetry is the same rule as the lodger statute: a wrong number on an executed lease is
worse than no number. Do not populate a jurisdiction's field without a source verified for
THAT jurisdiction.

`SEATTLE_LEASE_CONFIG` now derives from `WASHINGTON_LEASE_CONFIG` and
`SAN_FRANCISCO_LEASE_CONFIG` from `CALIFORNIA_LEASE_CONFIG` (spread + override), so a
state-level statute or term is written once. Duplicating them meant a citation update had to
land in two places per state, and a missed one silently shipped a stale citation.

Coverage: `tests/unit/stay-pricing-repro.test.ts` asserts a California lease contains none of
the three WA figures and that a Washington lease still contains all of them.

## The document never asserts a credit the ledger will not apply

`HOLDING_DEPOSIT_CREDIT_NOTE` renders only when `rentalType !== "short_term"`. The ledger
credits a paid holding deposit on its STANDARD branch only; the explicit short-term branch
charges the full `shortTermDeposit` and returns before that code. Keyed on `rentalType`, not
on the resolved `stayKind`, for exactly the same reason the deposit amount is: the stay
document also backs a standard application, and in that case the credit IS applied.

## One room lookup on the ledger side

`resolveRowSubmissionRoom` / `roomForRow` are the only way `household-charges.ts` picks a
room, and they call the shared `resolveSubmissionRoom`. `selectedRoomRentAmount`,
`selectedRoomUtilities`, `selectedRoom`, and `recordApprovedApplicationCharges` previously
resolved it three different ways, so one approval could bill rent off one room and utilities
off another while the lease quoted a third. The private `findRoomInSub` is deleted; do not
reintroduce a local lookup.

## Known gaps, not fixed here

- **Uploaded-template properties never reach the short-term agreement.**
  `buildAiGeneratedLeaseHtml` returns `buildManagerTemplateLeaseHtml` before the jurisdiction
  dispatch, so a nightly stay at such a property gets the monthly-worded Placement Summary. The
  rent LABEL there now follows the resolved basis, but the document shape does not.
- **`bundle.shortTermNightlyRent` is advertised but never billed.** Listing cards show it;
  neither the ledger nor the lease uses it. Both fall back to the listing default.
- **Drifted duplicate helpers.** `escapeHtml` and `dash` still exist in both
  `generated-lease.ts` and `build-lease-html.ts`. They are pure formatters that have not
  drifted, so they were left alone; the room-rent pair that HAD drifted is now the shared
  `listing-room-resolution.ts` (see "One rule, one implementation" above).
- **Short-term default check-in time is `"10:00 PM"`** (`build-lease-html.ts`), which reads like
  a typo for an afternoon check-in such as 3:00 PM.
- **`parseMoneyAmount` concatenates every digit run**: `"500 refundable + $100 cleaning"` parses
  to `500100`, and that figure is both charged by the ledger and now printed on the lease. The
  fix (take the first numeric run, as `parseAmount` in `build-lease-html.ts` does) belongs in
  `parse-money.ts` and would move existing charge amounts, so it was left alone here.
- **The document cannot see `manualResidentDetails`.** For a manually-added resident the ledger
  prefers `manualResidentDetails.securityDeposit` and suppresses listing defaults entirely
  (`allowListingDefaults = !row.manuallyAdded`); the builder only receives the application, so
  it still quotes the listing default. Pre-existing.
- **A "3-day pay-or-vacate / 10-day cure" framing is still hardcoded** in the Default &amp;
  Remedies section. It sits beside `defaultNoticeStatuteRef` but is not driven by it, so it
  reads as a nationwide rule. Same class as the three numeric terms fixed below; it needs its
  own optional config field and a verified figure per jurisdiction.
- **Dates render as raw ISO** (`2026-08-03`) on both documents rather than a written-out date.

## Coverage

| Test | What it pins |
| --- | --- |
| `tests/unit/stay-pricing.test.ts` | the resolver in isolation: all four precedence rules, both `stayKind` gates, both deposit branches, monthly no-ops |
| `tests/unit/stay-pricing-repro.test.ts` | document and ledger agree, end to end, on one fixture. This is the reproduction, flipped. Also the daily long form (8), stay utilities (11), the deposit obligation being unmoved by a holding-deposit payment (12, 13), the non-ISO span (14), daily long-form prorated utilities (15), and shared room resolution (16) |
| `tests/unit/daily-rent-charges.test.ts` | the monthly charge path is unmoved (`$851.61`, `Rent — April 2026`, no `/day`) |
| `tests/unit/lease-jurisdiction.test.ts` | address to jurisdiction, including the statewide fallbacks |
| `tests/unit/generated-lease.test.ts` | long-form document content |
