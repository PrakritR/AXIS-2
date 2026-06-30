# Portal list-section layout

Canonical layout for manager (pro) portal **list and data tabs**. Visual reference: **Inbox**, **Residents**, **Services**, **Leases**.

Full design tokens: [`design.md`](design.md). Implementation helpers: [`portal-list-section.tsx`](../src/components/portal/portal-list-section.tsx), [`portal-metrics.tsx`](../src/components/portal/portal-metrics.tsx), [`portal-data-table.tsx`](../src/components/portal/portal-data-table.tsx).

---

## Structure

```
ManagerPortalPageShell          ← single PORTAL_SECTION_SURFACE (outer card)
├── Header row                  ← title (left) · titleAside (right)
├── filterRow (optional)        ← tabs, pills, inline filters
├── border-b divider            ← always present
└── Body (children)
    ├── optional toolbar rows   ← date/property filters (flat, no nested card)
    └── PORTAL_DATA_TABLE_WRAP  ← or PortalDataTableEmpty
```

Use `PortalListSectionShell` as a thin alias when building new sections:

```tsx
<PortalListSectionShell
  title="Vendors"
  primaryAction={<PortalSectionPrimaryButton onClick={...}>Add vendor</PortalSectionPrimaryButton>}
  filterRow={<ManagerPortalFilterRow><TabNav ... /></ManagerPortalFilterRow>}
>
  {rows.length === 0 ? <PortalDataTableEmpty message="..." /> : <table>...</table>}
</PortalListSectionShell>
```

---

## Checklist (grep before shipping a new tab)

| # | Rule | How to verify |
|---|------|---------------|
| 1 | **One shell surface** — no nested `PORTAL_SECTION_SURFACE` in `children` | `rg PORTAL_SECTION_SURFACE` in the panel file; only the shell should use it |
| 2 | **Header actions** in `titleAside` via `PortalSectionPrimaryButton` / `PORTAL_HEADER_ACTION_BTN` | Primary CTAs not buried in body |
| 3 | **Mobile actions** duplicated in `PORTAL_FILTER_ACTIONS_MOBILE` inside `filterRow` when header has CTAs | Match Inbox / Residents |
| 4 | **Section tabs** in `filterRow`, not in raw `children` | URL tabs → `TabNav`; status buckets → `ManagerPortalStatusPills` |
| 5 | **Divider** below header/filter block | Provided by `ManagerPortalPageShell` (always-on `border-b`) |
| 6 | **Table body** uses `PORTAL_DATA_TABLE_WRAP` + `PORTAL_DATA_TABLE_SCROLL` + table tokens | See `portal-data-table.tsx` |
| 7 | **Empty state** is `PortalDataTableEmpty` directly — no extra bordered box around it | |
| 8 | **Status badges** use `portal-badge-*` + ring, `text-[11px]`, `px-2.5 py-0.5` | Match Residents portal column |
| 9 | **Secondary filters** (date, property) as flat toolbar rows in body (`mb-4`), not inside a nested card | Finances, Documents |

---

## Filter control pick

| Use case | Component |
|----------|-----------|
| URL-linked section tabs (Services, Documents) | `TabNav` in `ManagerPortalFilterRow` |
| In-section status with counts (Inbox, Residents, Leases) | `ManagerPortalStatusPills` |
| Binary view toggle | `PortalSegmentedControl` |
| Property scope | `PortalPropertyFilterPill` in `titleAside` or mobile filter row |

---

## Reference implementations

| Section | File | Notes |
|---------|------|-------|
| Inbox | [`manager-inbox.tsx`](../src/components/portal/manager-inbox.tsx) | Status pills + header/mobile actions |
| Residents | [`manager-residents.tsx`](../src/components/portal/manager-residents.tsx) | Property filter + status pills + table |
| Services | [`manager-all-services-panel.tsx`](../src/components/portal/manager-all-services-panel.tsx) | `TabNav` + conditional header CTA |
| Leases | [`manager-leases.tsx`](../src/components/portal/manager-leases.tsx) | Property filter + status pills |

---

## Known exceptions (do not force list-section layout)

| Section | Reason |
|---------|--------|
| Dashboard | KPI tile grid |
| Calendar | Week/month grid |
| Settings / Profile | Form sections, not data tables |
| Billing (Plan) | Pricing / subscription UI |
| Properties (listings) | Embedded sub-panel; no section tabs |

---

## Anti-patterns

- Tabs rendered as raw `Link` pills in `children` instead of `filterRow` + `TabNav`
- Nested `PORTAL_SECTION_SURFACE` wrapping filters + table (double card)
- Standalone `rounded-2xl border bg-card` blocks for entire list pages (Co-managers link form)
- Export / Add buttons only in body instead of `titleAside`
- Custom empty states inside nested boxes instead of `PortalDataTableEmpty`

---

## Audit log

See **Portal layout conformance** in [`ui-review-issue-matrix.md`](ui-review-issue-matrix.md) for per-section pass/fail status.
