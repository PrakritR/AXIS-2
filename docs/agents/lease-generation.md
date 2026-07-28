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
