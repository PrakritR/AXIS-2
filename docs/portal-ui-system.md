# Portal UI system

Canonical patterns for expandable rows, section cards, and data tables across manager, resident, vendor, and admin portals. **Read this before editing portal UI.**

Reference implementation: **resident detail in the property portal** (`manager-residents.tsx` → `ResidentDetailSection` + nested tables).

## Expand chevron direction

| State | Icon | Component |
|-------|------|-----------|
| Collapsed | `ChevronRight` (→) | `PortalTableExpandChevron` |
| Expanded | `ChevronDown` (↓) | `PortalTableExpandChevron` |

Never rotate a single chevron — swap icons. Shared primitive: `PortalTableExpandChevron` in `portal-data-table.tsx`.

## Expandable table rows

**Rule:** Chevron sits **inline immediately after the primary label** in the first (or designated primary) data column. No trailing expand column.

```tsx
import {
  PORTAL_DATA_TABLE,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_DETAIL_CELL,
  PortalTableInlineExpand,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";

<tr
  className={PORTAL_TABLE_TR_EXPANDABLE}
  onClick={createPortalRowExpandClick(() => toggle(row.id))}
  aria-expanded={expanded}
>
  <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>
    <PortalTableInlineExpand expanded={expanded}>{row.name}</PortalTableInlineExpand>
    <p className="mt-0.5 text-xs text-muted">{row.email}</p>
  </td>
  <td className={PORTAL_TABLE_TD}>{row.property}</td>
</tr>
{expanded ? (
  <tr className={PORTAL_TABLE_DETAIL_ROW}>
    <td colSpan={COLUMN_COUNT} className={PORTAL_TABLE_DETAIL_CELL}>
      {detailContent}
    </td>
  </tr>
) : null}
```

### Do NOT use (deprecated)

- `PORTAL_TABLE_EXPAND_TH` — zero-width trailing header column
- `PortalTableExpandCell` — trailing chevron cell at far right
- `justify-between` + chevron on mobile card headers (creates huge gap)

### Table layout tokens

| Token | Purpose |
|-------|---------|
| `PORTAL_DATA_TABLE_WRAP` | Outer card frame for tables |
| `PORTAL_DATA_TABLE_SCROLL` | Overflow wrapper |
| `PORTAL_DATA_TABLE` | `table-fixed w-full` base |
| `MANAGER_TABLE_TH` | Header cell (`w-0` for fluid columns) |
| `PORTAL_TABLE_TD` | Data cell (`max-w-0 break-words px-4 py-4`) |
| `PortalDataTableColGroup` | Optional weighted column widths |

Good examples: `portal-inbox-ui.tsx`, `resident-applications-panel.tsx` (desktop), `manager-residents.tsx` (main residents table).

## Dashboard / section cards

For collapsible property-portal sections (APPLICATION, LEASE, PAYMENTS):

```tsx
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";

<PortalCollapsibleSection
  title="Payments"
  titleVariant="resident"   // uppercase muted label + inline chevron
  subtitle="2 pending · 1 overdue"
  expanded={expanded}
  onExpandedChange={setExpanded}
  headerActions={<Button>Add</Button>}
>
  {sectionContent}
</PortalCollapsibleSection>
```

- Title + chevron: `inline-flex items-center gap-1.5` (no `justify-between` on title row)
- Subtitle: `mt-1 text-sm text-muted` on the line below
- Chevron: right when collapsed, down when expanded (built into component)

`ResidentDetailSection` in `manager-residents.tsx` wraps `PortalCollapsibleSection` with `titleVariant="resident"`.

### `PortalCollapsibleSection` vs table inline expand

| Use | When |
|-----|------|
| `PortalCollapsibleSection` | Standalone section cards with header + body (property detail panels, promotion blocks, settings groups) |
| `PortalTableInlineExpand` | Rows inside a `<table>` or mobile list cards that expand to show detail |

## Mobile card expand pattern

Use `PortalMobileSummaryCard` when you need title + subtitle + optional badge/trailing actions:

```tsx
<PortalMobileSummaryCard
  title={row.name}
  subtitle={row.email}
  expanded={expanded}
  onClick={() => toggle(row.id)}
>
  {expanded ? detail : null}
</PortalMobileSummaryCard>
```

For custom mobile cards, put the chevron inline with the title:

```tsx
<button type="button" className="w-full text-left" onClick={toggle}>
  <PortalTableInlineExpand expanded={expanded} className="font-semibold text-foreground">
    <span className="truncate">{title}</span>
  </PortalTableInlineExpand>
  <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>
</button>
```

`PortalResponsiveDataView` pairs mobile card stack (`lg:hidden`) with desktop table (`hidden lg:block`).

## Expanded detail actions

```tsx
import { PortalTableDetailActions, PORTAL_DETAIL_BTN } from "@/components/portal/portal-data-table";

<PortalTableDetailActions>
  <Button variant="outline" className={PORTAL_DETAIL_BTN}>Schedule</Button>
</PortalTableDetailActions>
```

## Page shell & filters

Admin/manager tab tables use `ManagerPortalPageShell` with `filterRow` above the divider — see `admin-inbox-client.tsx` and `AGENTS.md` → Admin portal table tabs.

### A portal page's scroller is `.portal-list-page-scroll`, not the window

`ManagerPortalPageShell` defaults to `stickyPageChrome`, which sets
`html[data-portal-sticky-chrome]`. That flips `#portal-main-content` to
`overflow: hidden` and moves the scroll into the `.portal-list-page-scroll` box
that `renderPortalStickyBody` wraps the page body in
(`src/lib/portal-page-chrome-layout.tsx`). Communication surfaces do the same via
`html[data-communication-surface]`. Everything between those two elements must
therefore stay a `flex min-h-0 flex-1 flex-col` chain, or the scroller sizes to
its content inside a clipped parent and the page silently stops scrolling below
the first viewport — no error, no failing build, and pages whose content happens
to fit look fine.

Watch for **unlayered rules in `globals.css` beating Tailwind utilities**: they
win over anything in `@layer utilities` regardless of specificity, so a rule like
`.portal-main-inner > * { flex: 0 0 auto }` overrides the shell's `flex-1`. That
one shipped and clipped Settings, Payments and Residents on every phone. Scope
new `.portal-main-inner` / `#portal-main-content` layout rules to the surfaces
they mean (`html:not([data-portal-sticky-chrome]):not([data-communication-surface])`
for page-scrolls surfaces). Coverage: `tests/unit/portal-mobile-shell.test.ts`.

The same split governs **bottom clearance**. On a page-scrolls surface
`#portal-main-content` is the scroller, so its `padding-bottom` becomes trailing
scroll room; on a sticky-chrome surface it is clipped, so padding there can only
shrink the scroll viewport into a dead band. Phone-width sticky-chrome rules
therefore reserve only what is genuinely fixed over the page — the bottom-nav
inset, plus the bulk-action bar when one is open — and hand the assistant FAB
clearance to `.portal-list-page-scroll`, which can actually scroll it. Never
reserve the combined `--portal-mobile-scroll-bottom-inset` on a clipped element;
the rationale and the disjoint bulk-bar selector are commented at the rules in
`globals.css`.

Verify a phone change by measuring, not by eyeballing the first screenful:
`scroller.scrollHeight - scroller.clientHeight` must be > 0 and
`inner.scrollHeight - inner.clientHeight` must be 0 on a page taller than the
viewport.

## Filter dropdowns: one portaled-overlay pattern

Every portal filter field (property / resident / status / sort / scope) is ONE
pattern: a single-line trigger showing a summary (placeholder when empty) + a
chevron, and an option list that opens as a PORTALED OVERLAY anchored to the
trigger — never inline in flow. Opening a field must not push the fields below it
or resize the panel.

- **Shared machinery:** `src/components/ui/field-select-menu.tsx`
  (`useFieldSelectMenu`, `resolveFieldSelectMenuPortal`, rect math, the 5-row
  constants, `FieldSelectMenuSearch`). It portals into the open modal / Vaul
  sheet shell when there is one, else `document.body` — so it works inside the
  `PortalFilterSortSheet` modal, the mobile bottom sheet, and the desktop
  dropdown popover alike. Do NOT fork a second positioning implementation.
- **The filter panel itself is portaled too.** `PortalFilterSortSheet`'s desktop
  dropdown anchors through the same `useFieldSelectMenu`, so it escapes the
  page's scroll/overflow instead of being absolutely positioned inside the
  toolbar. Its height comes from `portalFilterPanelSizeClass(filterFieldCount)`
  — pass `filterFieldCount` (the number of filter rows you render, default 1) or
  a multi-field panel opens at single-field height.
- **Filter fields:** `src/components/portal/filter-field-lists.tsx`
  (`FilterCollapsibleSection` + `FilterCheckboxList` multi / `FilterSingleSelectList`
  single, inside a `FilterFieldsAccordion` for one-open-at-a-time). `CheckboxMultiSelect`
  / `FieldSingleSelect` (`checkbox-multi-select.tsx`) are the same pattern for
  form/toolbar/scope pickers — prefer them over a bare `<select>`.
- **5 rows, then scroll:** the cap lives on the portaled SHELL — its `maxHeight`
  is `fieldSelectMenuContentPx(FIELD_SELECT_MENU_VISIBLE_ITEMS, …)`, and
  `FIELD_SELECT_MENU_VISIBLE_ITEMS` (aliased as `FILTER_LIST_VISIBLE_ROWS`) stays
  the single source of the "5" — and the option list is a shrinkable flex child
  (`FIELD_SELECT_MENU_LISTBOX_SCROLL_CLASS`, which also carries the touch-scroll
  affordances) that scrolls under it. The menu otherwise sizes to its real content, so a short or
  filtered list leaves no empty space below it; never give the listbox a fixed
  height or `flex-1`, both of which break that. A search box appears only when a
  field has MORE than 5 options and never drops an already-selected option.
  Regression coverage: `tests/unit/filter-field-lists.test.tsx`.

## Modals scroll in ONE place

The `Modal` body (`src/components/ui/modal.tsx`) is the modal's single scroll
container in both variants (with and without `footer`). Do not wrap modal
children in another `overflow-y-auto` — nested scrollers trap touch scrolling
in the native WebView — and never reintroduce `overflow-hidden` on the body:
that clipped every below-the-fold field on phones for footer modals whose
children didn't hand-roll a scroller (`tests/unit/modal-scroll-container.test.tsx`
pins this). A child may still pin an inner scroll region (`min-h-0 flex-1
overflow-y-auto`, e.g. a message body) — the footer variant keeps the flex
column chain for that. Field-level scrolling (a `max-h` textarea) is fine.

Native shell: the panel caps at `100dvh` minus the safe-area insets and the
backdrop wrapper pads by the same insets (see `MODAL_PANEL_CLASS`), so the
header/Close never sits under the notch.

Client-generated file saves (flyers, exports) must go through
`downloadOrShareFile` (`src/lib/native/download-or-share.ts`) — a synthetic
`<a download>` on a blob URL is silently ignored in iOS WKWebView; the helper
web-downloads on web and presents the native share sheet in the app shell.
Fixed-width document previews (the flyer iframe) scale to fit the container
width instead of relying on iframe-internal scrolling, which is unreliable in
WKWebView — see `computeFlyerFit` + `useFlyerFit` in
`promotion-flyer-preview.tsx`. WKWebView also does not render a PDF embedded in
an iframe/object at all, so `UploadedLeasePdfPreview`
(`uploaded-lease-pdf-preview.tsx`) deliberately keeps TWO render paths: the
browser's native viewer on desktop, and in-page rasterization with the pdf.js
build that already ships inside `unpdf` (dynamically imported, so its chunk stays
out of the initial bundle) on iOS / native. Rasterizing belongs in the client —
the bytes are already there, so it costs no round trip. Coverage:
`tests/unit/uploaded-lease-pdf-preview.test.tsx`.

## Checklist for new expandable UI

1. Chevron inline after primary label (`PortalTableInlineExpand` or `PortalCollapsibleSection`)
2. Collapsed → `ChevronRight`, expanded → `ChevronDown`
3. No trailing expand column
4. `createPortalRowExpandClick` on expandable `<tr>` rows
5. `aria-expanded` on toggle targets
6. Mobile + desktop both follow inline chevron pattern
7. `colSpan` on detail row = data column count only (no expand column)

## Reference files

| Pattern | File |
|---------|------|
| Section cards (resident detail) | `manager-residents.tsx` → `ResidentDetailSection` |
| Table inline expand (inbox) | `portal-inbox-ui.tsx` |
| Resident applications table | `resident-applications-panel.tsx` |
| Collapsible section primitive | `portal-collapsible-section.tsx` |
| Table primitives | `portal-data-table.tsx` |
| Mobile summary card | `PortalMobileSummaryCard` in `portal-data-table.tsx` |
| In-modal assistant side panel | `modal-assistant-strip.tsx` + `modal.tsx` / `manager-add-listing-form.tsx` |

## In-modal PropLane Assistant: side panel, not a bottom band

`ModalAssistantStrip` (embedded via the shared `Modal` component, and directly
in the listing wizard `manager-add-listing-form.tsx` — the only two embed
points) opens beside the modal's content once the modal is wide enough,
instead of always stacking below it. The switch is a CSS container query, not
a viewport breakpoint: modal widths vary hugely across embed points (`max-w-md`
at 448px up to the listing wizard's `max-w-6xl` at 1152px), so a single
viewport breakpoint would force many already-narrow modals into an unusable
side-by-side squeeze. The row layout engages at the Tailwind `@2xl` container
breakpoint (42rem / 672px of available panel width) — below that (every phone
viewport, and any modal capped at `max-w-lg`/`max-w-md` or narrower even on a
wide screen) it stays the original stacked layout. The strip owns its own
open/closed state and reports it via `onExpandedChange` so the ancestor can
flip `flex-col` → `@2xl:flex-row`; the row layout itself is gated on that JS
"open" state too, so a *collapsed* strip is always the original thin bottom
bar regardless of width.

**Which side, and open by default.** Two opt-in props tune this per surface,
both defaulting to the shared-`Modal` behavior so only the listing wizard
changes: `side` (`"right"` default) picks whether the expanded chat docks left
or right (it swaps the `@2xl` divider between `border-l`/`border-r` and the inner
padding), and `defaultExpanded` (`false` default) is the initial + per-open state.
The listing wizard passes `side="left"` and `defaultExpanded={prefersAssistantOpenBeside()}`
(true only at ≥1024px viewport) so managers see the assistant to the *left* of the
form on desktop, collapsed on phones/tablets. Because content stays first in the
DOM (so the collapsed strip and the whole narrow-screen stack sit *below* the
fields), the wizard floats the expanded chat left with `@2xl:order-first`, applied
only while open. `prefersAssistantOpenBeside()` guards `window.matchMedia` for SSR
and jsdom.

**Gotcha:** a CSS container cannot query its own size for its own layout —
`@container` must sit on an ancestor (the modal panel / wizard panel `<div>`) of the
element whose `@2xl:flex-row` reacts to it, one level up. Putting `@container`
and `@2xl:flex-row` on the same element silently no-ops (it stays column no
matter how wide the container gets). Cost real debugging time once; verify any
new container-query layout with a computed-style check
(`getComputedStyle(el).flexDirection`), not just a class-list read.
