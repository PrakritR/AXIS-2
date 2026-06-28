# San Francisco lease reference

San Francisco room rental templates, statutory disclosures, and local addenda notes.

## Files

| File | Purpose |
|------|---------|
| `sample-lease.md` | Structural outline for CA/SF room rental agreement |
| `../disclosure-clause-rules.json` | Statutory disclosure & clause rules (federal + CA + SF) |
| `../lease-generation-manifest.json` | Document blueprint, merge fields, fee validators |

## San Francisco rule IDs (lease signing)

`fed-lead-paint`, `ca-megans-law`, `ca-ab1482-notice`, `ca-shared-utility`, `ca-ordnance`, `ca-mold`, `ca-bedbug`, `ca-pest-control`, `ca-flood`, `ca-smoking`, `ca-death-on-premises`, `ca-translation`, `sf-coverage-determination`, `sf-rent-ordinance-disclosure`

## Code template

`src/lib/lease-templates/san-francisco.ts` → `build-lease-html.ts` with `SAN_FRANCISCO_LEASE_CONFIG`

## Critical validators (before shipping)

- **AB 1482 notice:** Verbatim text; **≥12-point** font when unit is not exempt.
- **Rent Ordinance disclosure:** Verbatim §37.9F(d) when `is_rent_ordinance_covered`; **≥12-point** font.
- **Coverage determination:** Run `sf-coverage-determination` decision tree — not a single boolean.
- **Translation:** If lease negotiated in Spanish, Chinese, Korean, Tagalog, or Vietnamese → full translated copy (Cal. Civ. Code §1632).

## Ordinance references

- California Civil Code (landlord-tenant)
- Cal. Health & Safety Code §§26147–26148 (mold)
- SF Administrative Code Chapter 37 (Rent Ordinance)
- SF Rent Board forms: https://www.sfrb.org

Replace `sample-lease.md` with your attorney-approved SF template when available.
