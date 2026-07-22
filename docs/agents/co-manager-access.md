> Moved out of AGENTS.md to keep every-session context lean. This file is the
> source of truth for its area — READ IT BEFORE changing code in this area.

# Co-manager access (module scoping + granular levels)

**A co-manager link grants module access; the permissions editor restricts it.**
An accepted `account_link_invites` row with an EMPTY permissions object grants
every module on its assigned properties (assignment IS the grant); once any
module is checked, the set becomes a restriction. Grants are per-property, per
module, and now carry LEVELS: legacy `true` = read+edit+delete; the granular
form is `{ read, edit, delete }` (`edit`/`delete` imply `read`). Model + level
helpers live in `src/lib/co-manager-permissions.ts`
(`hasCoManagerPermissionLevel[ForProperty]`).

**`assigned_property_ids` is authorization, not a request field.** Because an
empty permissions object is a FULL grant, the assigned list alone decides what a
co-manager reaches. Every route that sets it validates it against real ownership
with `findPropertyIdsNotOwnedByManager`
(`src/lib/auth/co-manager-invite-scope.ts`) and rejects the whole request (403)
if any id is not the inviter's — a non-existent id counts as unowned, and a
lookup failure fails closed. This applies on `POST /api/pro/account-links` and
on the post-accept `PATCH`, where the property scope is additionally
**inviter-only** (the invitee may still edit the payout split, but widening
their own scope was a self-service takeover of any publicly-listed property id).
Coverage: `tests/unit/co-manager-invite-scope.test.ts`,
`tests/integration/portal/co-manager-invite-property-scope.test.ts`.

**Server scoping** — `src/lib/auth/co-manager-module-scope.ts`:
`linkedPropertyIdsForModule` (property-keyed tables),
`linkedOwnerScopeForModule` (owner-keyed tables like the vendor directory),
`fetchRowsForManagerWithLinked` (owned+linked merge, deduped). Wired into the
GET paths of work orders, service requests, household charges, vendors, and
manager documents; leases/applications/property-records already had their own
(`fetchLeasesForManagerUser` etc.). Write enforcement goes through
`assertCoManagerModuleAccess(..., { level: "edit" })`
(`src/lib/auth/co-manager-access.ts`) — bills POST is the exemplar.

**Client mirrors** — `collectLinkedPropertyIdsForModule` /
`collectLinkedOwnerIdsForModule` / `moduleRowVisibleToPortalUser` in
`src/lib/manager-portfolio-access.ts`. Storage libs (household-charges,
manager-vendors-storage, service-requests) stay dependency-free: panels pass
the precomputed sets as OPTIONAL PARAMS (avoids the
portal-data-store↔household-charges import cycle). Copy that pattern.

**Hard-won gotcha:** the account-links API selects BOTH
`property_co_manager_permissions` and legacy `co_manager_permissions`; a 2026-06
migration RENAMED the legacy column away, so every select errored and the panel
silently fell back to localStorage-only mode ("Save link (local)") — that was
the entire "co-manager does nothing" bug. `20260716120000` restores the column.
The panel now defaults to remote mode and only downgrades on a confirmed
missing table (`migrationRequired`), never on transient errors.
