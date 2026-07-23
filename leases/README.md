# Lease reference materials

This folder holds **sample leases, disclosure rules, and city-specific notes** used to align PropLane generated leases with your legal templates.

## Structure

| Path | Purpose |
|------|---------|
| `disclosure-clause-rules.json` | **Master rules catalog** — federal, state, and city disclosure/clause rules with triggers, verbatim text, and citations |
| `lease-generation-manifest.json` | **Generation manifest** — document sections, merge fields, fee validators, attachments, implementation checklist |
| `seattle/` | Washington / Seattle samples and notes |
| `san-francisco/` | California / San Francisco samples and notes |

## How PropLane uses these files

Generation code in `src/lib/lease-templates/` mirrors the structure and clauses from samples here. JSON manifests are **reference material** — they are not parsed at runtime in phase 1. When you update rules or samples, port the relevant sections into the matching template file in code after attorney review.

## Supported jurisdictions (generation)

AI lease generation is enabled only for:

- **Seattle** (Washington) — inherits `federal` + `washington` + `seattle` rules
- **San Francisco** (California) — inherits `federal` + `california` + `san_francisco` rules

Other cities: managers can still **upload** a PDF lease and use in-portal or manual signing.

## Legal review

Both JSON files set `"legal_review_required": true`. Records with `cite_verified: false` must be confirmed against primary sources before driving production leases. Verbatim blocks (`verbatim_required: true`) must be inserted exactly as written (and at required font size where noted).

## Merge fields

Generated leases pull from the approved rental application and listing. See `lease-generation-manifest.json` → `merge_fields` for the full dictionary. Core fields:

| Field | Source |
|-------|--------|
| Resident name, contact, DOB | Application |
| Landlord / building | Listing submission |
| Address, room | Property + room choice |
| Rent, deposits, fees | Application overrides or listing |
| Lease term / dates | Application placement |
| House rules, shared spaces | Listing submission |
| Trigger fields (year built, flood zone, etc.) | Property admin — add as product fields |
