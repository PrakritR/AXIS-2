# UI Review Issue Matrix

Structured audit of all five Blue Steel surfaces against [`design.md`](design.md) and the canonical portal list-section pattern in [`portal-list-section.tsx`](../src/components/portal/portal-list-section.tsx).

**Severity:** P0 = breaks spec or accessibility; P1 = visible inconsistency; P2 = maintainability / naming drift.

| Surface | Route/Section | Dimension | Severity | Current | Expected | File(s) | Fix phase |
|---------|---------------|-----------|----------|---------|----------|---------|-----------|
| Primitives | Global | Component consistency | P1 | ~~Dual empty states~~ | Portal panels use `PortalDataTableEmpty` only | `portal-workspace-client.tsx` | **Done** (Wave 0) |
| Primitives | Global | Component consistency | P1 | ~~Dual tables~~ | Portal panels use `PORTAL_DATA_TABLE_*` | `portal-workspace-client.tsx` | **Done** (Wave 0) |
| Primitives | Global | Component consistency | P1 | ~~Dual shells~~ | `PortalListSectionShell` wrapper | `portal-list-section.tsx` | **Done** (Wave 0) |
| Primitives | Global | Deprecation | P2 | ~~`PORTAL_EMPTY_STATE_BOX`~~ | Single source in `portal-empty-state.tsx` | `portal-data-table.tsx` | **Done** (Wave 0) |
| Pro portal | Fallback workspace | Portal patterns | P1 | ~~Legacy shell/table/empty~~ | Canonical list-section pattern | `portal-workspace-client.tsx` | **Done** (Wave 1) |
| Pro portal | All list sections | Portal patterns | P2 | ~~Shell not implemented~~ | `PortalListSectionShell` | `portal-list-section.tsx` | **Done** (Wave 0) |
| Pro portal | Filters | Component consistency | P2 | Mixed pill controls | Documented pick per use case in JSDoc | `portal-list-section.tsx` | **Done** (Wave 0) |
| Marketing | `/`, `/partner`, `/rent/apply` | Chrome & substrate | — | Per spec | Per spec | `(public)/*` | OK |
| Marketing | `/billing/success` | Chrome & substrate | P2 | ~~Quiet chrome~~ | Full chrome per spec | `billing/success/page.tsx` | **Done** (Wave 2) |
| Auth | `/auth/*`, `choose-portal` | Chrome & substrate | — | Per spec | Per spec | `auth/*` | OK |
| Auth | OAuth finish pages | Copy & hierarchy | P2 | ~~Inconsistent spinners~~ | `AuthOAuthLoading` shared component | `auth/*-oauth*`, `continue` | **Done** (Wave 2) |
| Resident | `move-in` (locked) | Empty & loading | P1 | ~~Custom glass-card empty~~ | `PortalDataTableEmpty` | `render-portal-section.tsx` | **Done** (Wave 2) |
| Resident | Dashboard | Responsive | P2 | ~~Tiles lacked min touch height~~ | `min-h-[88px]` on `PortalDashboardTile` | `portal-metrics.tsx` | **Done** (Wave 2) |
| Resident / Admin | Nav, review queues | Surface differentiators | — | Per spec | Per spec | `portal-sidebar.tsx`, `admin-properties-client.tsx` | OK |
| All portals | Layout | Accessibility | P0 | ~~No skip link~~ | `PortalSkipLink` → `#portal-main-content` | portal layouts | **Done** (Wave 3) |
| All portals | Modals | Accessibility | P1 | ~~No focus trap~~ | `useFocusTrap` in `Modal` | `ui/modal.tsx` | **Done** (Wave 3) |
| All portals | Mobile `<lg` | Responsive | P2 | ~~Mobile nav unlabeled~~ | `aria-label="Portal sections"` | `portal-sidebar.tsx` | **Done** (Wave 3) |
| Pro portal | Naming | Maintainability | P2 | `manager-*` components at `/portal` route | Incremental rename to `pro-*` | `components/portal/manager-*.tsx` | Wave 4 |

## Cross-cutting inventory (legacy vs canonical)

| Pattern | Legacy usage | Canonical |
|---------|--------------|-----------|
| Page shell | ~~`ManagerSectionShell` in workspace client~~ | `PortalListSectionShell` |
| Empty state | `EmptyState` — loading skeletons only | `PortalDataTableEmpty` in data panels |
| Data table | ~~`DataTable` in workspace client~~ | `PORTAL_DATA_TABLE_WRAP` + raw `<table>` |
| Header CTA | Ad-hoc `Button` classes in some panels | `PortalSectionPrimaryButton` |

## Clusters for fix PRs

1. **Wave 0 — Foundations:** `PortalListSectionShell`, deprecate dual helpers, filter-control JSDoc
2. **Wave 1 — Workspace fallback:** Migrate `portal-workspace-client.tsx`
3. **Wave 2 — Surface polish:** Billing success chrome, move-in empty, dashboard tiles, OAuth loading
4. **Wave 3 — A11y:** Skip link, modal focus trap, mobile nav audit
5. **Wave 4 — Naming:** `manager-*` → `pro-*` (incremental, low priority)
