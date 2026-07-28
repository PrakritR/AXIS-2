# Lease generation & execution

## Execution evidence (P4)

A lease is binding because it was validly executed, and the electronic part was
already fine: a typed name plus the certificate satisfies ESIGN and state UETA.
What was missing was evidence of **what** was signed. The certificate recorded a
name and a timestamp; nothing tied a signature to a specific document, so there
was no way to prove which version a party agreed to. Everything below exists to
close that.

Owner files: `src/lib/lease-execution-evidence.ts`,
`src/lib/lease-pipeline-storage.ts`, `src/lib/lease-pdf-signing.ts`.

### Fields (fixed contract)

`portal_lease_pipeline_records` is
`(id, manager_user_id, resident_user_id, resident_email, property_id, status, row_data jsonb, created_at, updated_at)`.
The whole row lives in `row_data`, so **none of this needed a migration.**

On `LeasePipelineRow`:

| Field | Type | Written by |
| --- | --- | --- |
| `documentSha256` | `string \| null` | this agent, at first signature |
| `executedJurisdiction` | `string \| null` | a later agent — `"US-CA"` or `"US-CA/san_francisco"` |
| `templateVersion` | `string \| null` | a later agent — template id plus semver, e.g. `"ca-residential@1.2.0"` |

On `LeaseSignature` (per party):

| Field | Type | Meaning |
| --- | --- | --- |
| `documentSha256` | `string \| null` | SHA-256 of the document **this** party was shown |
| `consentVersion` | `string \| null` | version of the consent text they accepted (`esign-consent-v1`) |

All five are optional, and `normalizeLeasePipelineRow` resolves an absent value
to `null`. A lease signed before this change has none of them and renders,
downloads, and displays exactly as before. **Do not backfill a guessed value** —
absent means unknown, and unknown is honest.

`executedJurisdiction` and `templateVersion` are defined, threaded through
normalization and persistence, and left `null`. This agent does not resolve
jurisdiction; the fields are ready for the agents that will.

### When the hash is computed, and over what bytes

At **signature time**, never at generation time, in `residentSignLease` and
`managerSignLease` (`lease-pipeline-storage.ts`) via `leaseDocumentSha256`.
Each party's hash is taken from the pre-signature row — the exact document
`LeaseSigningModal` rendered for them.

| Document | Bytes hashed |
| --- | --- |
| Generated lease | `row.generatedHtml`, UTF-8 encoded |
| Uploaded PDF | `managerUploadedPdf.originalDataUrl`, base64-decoded |

**The uploaded-PDF hash covers the ORIGINAL upload, not
`managerUploadedPdf.dataUrl`.** That field holds the copy with the signature
certificate page appended, which changes as each party signs — and a
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
the first. `row.documentSha256` is set at the **first** signature and never
overwritten, so it always means "the document as first executed".

When the two differ, `signedDocumentHashesDiverge(row)` is true and both the
HTML certificate block and the PDF certificate page print a warning naming each
party's own fingerprint. Through the portal this is now impossible (a signed
row's body is immutable, below), so it means an out-of-band edit reached the
record — exactly the case where the certificate must not pick a winner.

### Consent to transact electronically

`LeaseSigningModal` already required an affirmation that the typed name is a
binding signature, but not ESIGN's consent to **do business electronically and
receive records in electronic form**. `LEASE_ESIGN_CONSENT_TEXT` /
`LEASE_ESIGN_CONSENT_VERSION` (`lease-execution-evidence.ts`) are now the single
source: the modal renders that constant as its required checkbox, signing
records the version on the signature, and both certificates quote the text back
— but only when the recorded version matches the current constant, so bumping
the wording can never make a certificate misquote an older signer.

**Not captured: IP address and user agent.** Attribution metadata needs a
server-side capture point; signing runs entirely in the browser through the
client storage layer, and a browser-reported IP is worthless as evidence.
Capturing it means routing signature writes through a route handler, which is
outside this agent's files. Flagged, not attempted.

### Signed documents are immutable in practice

`preserveSignedLeaseDocuments(prev, next)` (exported from
`lease-pipeline-storage.ts`) is the choke point, applied in `write()` and in
`materializeLeasePipeline()` — the only two paths that persist rows. A row that
carries a signature keeps its stored document body; a replacement is reverted,
not trusted. Putting it there rather than in each mutation means a new write
path inherits the guarantee instead of having to remember to call
`leaseAllowsManagerDocumentEdits`.

Three deliberate exemptions:

- **The certificate merge.** Comparison is on the *base* document
  (`generatedHtml` and `managerUploadedPdf.originalDataUrl`), so appending the
  certificate page into `dataUrl` at signing is allowed. `refreshUploadedPdfSignatures`
  now pins `originalDataUrl` before the first merge — without that, a legacy row
  carrying only `dataUrl` would have the certificate appended to an
  already-merged copy on the second signature, and the guard could not tell a
  merge from a swap.
- **Clearing the signatures.** Void, send-back-to-manager, renew, and amend all
  null the signatures; that is a superseding document, not a silent edit to an
  executed one, and it drops out of the guard by design.
- **Filling in an absent body on an `externallySignedLease` row.** That is how
  existing-resident onboarding files an already-executed off-platform PDF onto
  a row that never carried a document.

Coverage: `tests/unit/lease-signed-document-immutability.test.ts` — deleting the
guard call from `write()` turns its first test red.

### Removed: `regenerateAllLeaseHtml`

Deleted. It rebuilt a fully executed lease from current data and replaced the
signed text **without bumping the version**, and it had zero callers anywhere in
the repo including tests and scripts. Its only possible future was destroying
evidence. Its one helper, `refreshAllLeaseApplicationSnapshots`, and the stub
`recomputeLeaseSignedHtml` (which returned `true` and did nothing) went with it
as dead code. Do not reintroduce a bulk regenerator that can reach a row with a
signature.

### Known gaps, for the agents that come next

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
  That is correct — nothing was executed through the portal — but it means a
  present signature does not imply a present fingerprint.
