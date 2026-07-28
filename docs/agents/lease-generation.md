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
