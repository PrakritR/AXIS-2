# Seattle lease reference

Place Seattle-specific sample leases and compliance notes here.

## Files

| File | Purpose |
|------|---------|
| `sample-lease.md` | Full reference room rental agreement (Washington / Seattle) |
| `../disclosure-clause-rules.json` | Statutory disclosure & clause rules (federal + WA + Seattle) |
| `../lease-generation-manifest.json` | Document blueprint, merge fields, fee validators |

## Seattle rule IDs (lease signing)

`fed-lead-paint`, `wa-mold`, `wa-fire-safety`, `wa-movein-checklist`, `wa-deposit-terms`, `wa-nonrefundable-fees`, `wa-flood-disclosure` (future), `seattle-renters-handbook`, `seattle-180day-increase-addendum`, `seattle-just-cause`, `seattle-rrio`, `seattle-late-fee-cap`, `seattle-deposit-installments`

## Code template

`src/lib/lease-templates/seattle.ts` → `build-lease-html.ts` with `SEATTLE_LEASE_CONFIG`

## Critical validators (before shipping)

- **Late fee:** SMC 7.24.034 caps rent late fees at **$10/month** — template currently uses $50; must validate for Seattle.
- **Deposit + move-in:** Combined nonrefundable move-in + deposit ≤ one month's rent (SMC 7.24.035).
- **Rent increase notices:** 180 days in Seattle (not 90-day state minimum).
- **Renter's Handbook:** Printed copy at initial signing.

## Ordinance references

- RCW Chapter 59.18 (Washington Residential Landlord-Tenant Act)
- SMC 7.24 (Renting in Seattle / handbook, late fees)
- SMC 22.12 (EDRA relocation assistance)
- SMC 22.206 (Just cause eviction)
- SMC 22.214 (RRIO registration)
