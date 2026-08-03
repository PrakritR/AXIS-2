"use client";

import { ChevronDown } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { handlePortaledFieldSelectOptionPointerDown } from "@/components/ui/field-select-portal-interaction";
import { FIELD_SELECT_MENU_OPTION_CLASS } from "@/components/ui/field-select-styles";
import {
  FIELD_SELECT_MENU_LIST_MAX_HEIGHT_PX,
  FIELD_SELECT_MENU_SEARCH_PX,
  FIELD_SELECT_MENU_SHELL_CLASS,
  FIELD_SELECT_MENU_LISTBOX_SCROLL_CLASS,
  FIELD_SELECT_MENU_VISIBLE_ITEMS,
  FieldSelectMenuSearch,
  fieldSelectMenuContentPx,
  fieldSelectMenuListMaxHeightPx,
  fieldSelectMenuMatches,
  fieldSelectMenuZIndex,
  useFieldSelectMenu,
} from "@/components/ui/field-select-menu";
import { cn } from "@/lib/utils";

export const FILTER_FIELD_LABEL_CLASS =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted";

/** One source of the "5 rows visible, scroll for the rest" number — shared with all field-select menus. */
export const FILTER_LIST_VISIBLE_ROWS = FIELD_SELECT_MENU_VISIBLE_ITEMS;
export const FILTER_LIST_MAX_HEIGHT_PX = FIELD_SELECT_MENU_LIST_MAX_HEIGHT_PX;

/** Fixed portal filter shell — same width/height for modal, sheet, and desktop dropdown. */
export const PORTAL_FILTER_PANEL_WIDTH_CLASS = "w-[min(22rem,calc(100vw-2rem))]";
export const PORTAL_FILTER_PANEL_WIDTH_PX = 22 * 16;
export const PORTAL_FILTER_BROWSE_PANEL_WIDTH_PX = 28 * 16;

/** Parse fixed panel height from portal filter size class names (total shell height). */
export function portalFilterDropdownHeightPx(panelSizeClass: string): number {
  const remMatch = panelSizeClass.match(/h-\[(\d+(?:\.\d+)?)rem\]/);
  if (remMatch) return parseFloat(remMatch[1]) * 16;
  if (panelSizeClass.includes("min(36rem")) {
    const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
    return Math.min(36 * 16, viewportH * 0.82);
  }
  if (panelSizeClass.includes("28rem")) return 28 * 16;
  return 10.5 * 16;
}

export function portalFilterDropdownWidthPx(panelSizeClass: string): number {
  return panelSizeClass.includes("28rem")
    ? PORTAL_FILTER_BROWSE_PANEL_WIDTH_PX
    : PORTAL_FILTER_PANEL_WIDTH_PX;
}
export const PORTAL_FILTER_PANEL_HEIGHT_CLASS = "h-[28rem]";
export const PORTAL_FILTER_PANEL_SIZE_CLASS = `${PORTAL_FILTER_PANEL_WIDTH_CLASS} ${PORTAL_FILTER_PANEL_HEIGHT_CLASS}`;
/** Single-field compact filter dropdown. */
export const PORTAL_FILTER_PANEL_COMPACT_HEIGHT_CLASS = "h-[10.5rem]";
export const PORTAL_FILTER_PANEL_COMPACT_CLASS = `${PORTAL_FILTER_PANEL_WIDTH_CLASS} ${PORTAL_FILTER_PANEL_COMPACT_HEIGHT_CLASS}`;
export const PORTAL_FILTER_PANEL_TWO_FIELD_HEIGHT_CLASS = "h-[14rem]";
export const PORTAL_FILTER_PANEL_THREE_FIELD_HEIGHT_CLASS = "h-[19rem]";
/* One field row measures 76px (label + 44px trigger + gap); four of them plus the panel
   header and padding need ~23rem. At 19rem the fourth field rendered BELOW the panel's
   bottom edge and was only reachable by scrolling — measured on Communication, whose
   filter is house/role/resident/sort. */
export const PORTAL_FILTER_PANEL_FOUR_FIELD_HEIGHT_CLASS = "h-[23rem]";

/** Pick a fixed filter shell height from the number of filter rows (property, resident, sort, …). */
export function portalFilterPanelSizeClass(fieldCount: number): string {
  const heightClass =
    fieldCount >= 4
      ? PORTAL_FILTER_PANEL_FOUR_FIELD_HEIGHT_CLASS
      : fieldCount === 3
        ? PORTAL_FILTER_PANEL_THREE_FIELD_HEIGHT_CLASS
        : fieldCount === 2
          ? PORTAL_FILTER_PANEL_TWO_FIELD_HEIGHT_CLASS
          : PORTAL_FILTER_PANEL_COMPACT_HEIGHT_CLASS;
  return `${PORTAL_FILTER_PANEL_WIDTH_CLASS} ${heightClass}`;
}
/** Communication filter — four fields (house, role, resident, sort). */
export const PORTAL_FILTER_COMMUNICATION_PANEL_CLASS =
  `${PORTAL_FILTER_PANEL_WIDTH_CLASS} flex ${PORTAL_FILTER_PANEL_FOUR_FIELD_HEIGHT_CLASS} flex-col overflow-hidden`;
/** Mobile Communication / inbox filter sheet — scroll inside the elevated sheet body. */
export const PORTAL_FILTER_COMMUNICATION_MOBILE_SHEET_CLASS = "min-h-0";
/**
 * Default compact mobile sheet when callers do not override height. Deliberately imposes NO
 * max-height of its own: the raised sheet already caps itself at `100dvh - 32vh - 1rem` and
 * scrolls internally, so a second, smaller cap here only pushed the lower filter fields past
 * the sheet's bottom edge — where their dropdowns then had no room to open five rows.
 */
export const PORTAL_FILTER_COMPACT_MOBILE_SHEET_CLASS = "min-h-0";
/** Tall mobile sheet for browse-home filters (AI + manual fields). */
export const PORTAL_FILTER_BROWSE_MOBILE_SHEET_CLASS =
  "h-[min(82dvh,42rem)] min-h-[min(70dvh,34rem)]";

export const PORTAL_FILTER_BROWSE_PANEL_CLASS =
  "w-[min(28rem,calc(100vw-2rem))] h-[min(36rem,82vh)] min-h-[28rem]";
export const PORTAL_FILTER_BODY_CLASS =
  "flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-2";

/** Shared filter trigger icon sizing (toolbar Filter buttons). */
export const PORTAL_FILTER_ICON_CLASS = "size-3.5 shrink-0";

const FILTER_TRIGGER_CLASS =
  "flex h-11 max-h-11 w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-2xl border border-border bg-auth-input-bg px-4 py-2.5 text-left text-sm text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/25 focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 max-lg:rounded-xl";

/** Portal filter menus always show the search row (consistent with Resident/House pickers). */
export const FILTER_FIELD_MENU_ALWAYS_SHOW_SEARCH = true;

const FILTER_FIELD_MENU_SEARCH_PX = FILTER_FIELD_MENU_ALWAYS_SHOW_SEARCH
  ? FIELD_SELECT_MENU_SEARCH_PX
  : 0;

/** Estimated menu height (search row + 5 option rows) for open-up/positioning math. */
export const FILTER_MENU_CONTENT_PX = fieldSelectMenuContentPx(
  FIELD_SELECT_MENU_VISIBLE_ITEMS,
  FILTER_FIELD_MENU_SEARCH_PX,
);

type Option = { value: string; label: string };

type FilterFieldsAccordionContextValue = {
  openId: string | null;
  setOpenId: (id: string | null) => void;
};

const FilterFieldsAccordionContext = createContext<FilterFieldsAccordionContextValue | null>(null);

/** Mobile filter sheet: lock the sheet body while a portaled field menu is open. */
export const FilterSheetScrollLockContext = createContext<((locked: boolean) => void) | null>(null);

const FieldSelectMenuShellHeightContext = createContext<number | null>(null);

function useFieldSelectMenuShellHeight(fallbackPx: number): number {
  return useContext(FieldSelectMenuShellHeightContext) ?? fallbackPx;
}

export function useFilterAccordionClose(): () => void {
  const accordion = useContext(FilterFieldsAccordionContext);
  return () => accordion?.setOpenId(null);
}

/** One open dropdown at a time — Excel-style filter sheet behavior. */
export function FilterFieldsAccordion({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const setSheetScrollLocked = useContext(FilterSheetScrollLockContext);

  useEffect(() => {
    setSheetScrollLocked?.(openId !== null);
    return () => setSheetScrollLocked?.(false);
  }, [openId, setSheetScrollLocked]);

  return (
    <FilterFieldsAccordionContext.Provider value={{ openId, setOpenId }}>
      <div className="grid gap-3 max-lg:gap-2">{children}</div>
    </FilterFieldsAccordionContext.Provider>
  );
}

export function filterMultiSelectSummary(
  selected: string[],
  options: Option[],
  allLabel = "All",
): string {
  if (selected.length === 0) return allLabel;
  if (selected.length === 1) {
    return options.find((o) => o.value === selected[0])?.label ?? selected[0] ?? allLabel;
  }
  return `${selected.length} selected`;
}

export function filterSingleSelectSummary(value: string, options: Option[], allLabel = "All"): string {
  if (!value) return allLabel;
  return options.find((o) => o.value === value)?.label ?? value;
}

/**
 * Filter field trigger + portaled overlay menu. Closed by default (single-line
 * summary + chevron); opening portals the option list over the trigger so the
 * fields below keep their exact position and the panel keeps its exact height.
 * The shell caps at {@link FILTER_MENU_CONTENT_PX} (search row + 5 option rows) and
 * otherwise sizes to its content; the child list (`FilterCheckboxList` /
 * `FilterSingleSelectList`) scrolls under that cap and supplies its own search box
 * when there are more than 5 options.
 */
export function FilterCollapsibleSection({
  label,
  summary,
  children,
  dataAttr,
  sectionId,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  empty = false,
  menuOptionCount,
}: {
  label: string;
  summary: string;
  children: ReactNode;
  dataAttr?: string;
  /** When inside {@link FilterFieldsAccordion}, only one section opens at a time. */
  sectionId?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When true, summary uses placeholder styling (nothing selected). */
  empty?: boolean;
  /** Option count for portaled menu height (search row + capped list). */
  menuOptionCount?: number;
}) {
  const accordion = useContext(FilterFieldsAccordionContext);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);

  const openFromAccordion = sectionId && accordion ? accordion.openId === sectionId : undefined;
  const open = openFromAccordion ?? controlledOpen ?? uncontrolledOpen;

  const setOpen = (next: boolean) => {
    if (sectionId && accordion) {
      accordion.setOpenId(next ? sectionId : null);
    } else if (onOpenChange) {
      onOpenChange(next);
    } else {
      setUncontrolledOpen(next);
    }
  };

  const showMenuSearch =
    FILTER_FIELD_MENU_ALWAYS_SHOW_SEARCH || (menuOptionCount ?? 0) > FILTER_LIST_VISIBLE_ROWS;
  /* Size the menu to its OWN option count, capped at 5 rows by `fieldSelectMenuContentPx`.
     A field with 5+ options always shows exactly 5 and scrolls the rest; a field with
     fewer ends the box after its last row instead of padding out empty rows. */
  const menuContentPx = fieldSelectMenuContentPx(
    menuOptionCount ?? FILTER_LIST_VISIBLE_ROWS,
    showMenuSearch ? FIELD_SELECT_MENU_SEARCH_PX : 0,
  );

  const { listId, isClient, wrapRef, buttonRef, menuRect, portalHost } = useFieldSelectMenu({
    open,
    onOpenChange: setOpen,
    contentPx: menuContentPx,
    preferOpenDown: true,
    matchTriggerWidth: true,
  });

  /* No scroll-into-view on open: the menu is clamped to the VIEWPORT rather than to its
     host shell, so a low field already gets its full 5 rows, and scrolling the sheet body
     would move the very controls this pattern exists to keep stationary. */

  const menu =
    open && menuRect && isClient && portalHost ? (
      <div
        id={listId}
        data-field-select-menu=""
        data-vaul-no-drag=""
        className={cn(FIELD_SELECT_MENU_SHELL_CLASS, "bg-card flex min-h-0 flex-col overscroll-contain")}
        style={{
          position: menuRect.position,
          top: menuRect.top,
          left: menuRect.left,
          width: menuRect.width,
          /* `height: auto` under a hard cap is what makes a short list end early instead of
             padding empty rows; the cap is what keeps a long list at exactly 5. */
          height: "auto",
          minHeight: 0,
          maxHeight: menuRect.maxHeight,
          zIndex: fieldSelectMenuZIndex(portalHost),
          touchAction: "pan-y",
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
      >
        <FieldSelectMenuShellHeightContext.Provider value={menuRect.maxHeight}>
          {children}
        </FieldSelectMenuShellHeightContext.Provider>
      </div>
    ) : null;

  const isPlaceholder = empty;

  return (
    <div ref={wrapRef} data-attr={dataAttr}>
      <p className={FILTER_FIELD_LABEL_CLASS}>{label}</p>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${label}: ${summary}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        className={FILTER_TRIGGER_CLASS}
        onClick={() => setOpen(!open)}
      >
        <span
          aria-hidden
          className={cn("min-w-0 flex-1 truncate", isPlaceholder ? "text-muted/70" : "text-foreground")}
        >
          {summary}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {menu && portalHost ? createPortal(menu, portalHost) : null}
    </div>
  );
}

/** Multi-select checkbox list for filter menus — search appears once there are more than 5 options. */
export function FilterCheckboxList({
  options,
  selected,
  onChange,
  emptyMenuText = "No options",
  searchPlaceholder = "Search…",
  dataAttr,
}: {
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyMenuText?: string;
  searchPlaceholder?: string;
  dataAttr?: string;
}) {
  const [query, setQuery] = useState("");
  const showSearch = FILTER_FIELD_MENU_ALWAYS_SHOW_SEARCH || options.length > FILTER_LIST_VISIBLE_ROWS;
  const shellMaxHeightPx = useFieldSelectMenuShellHeight(FILTER_MENU_CONTENT_PX);

  // Filtering only hides rows; `selected` is never mutated, so searching never
  // drops an already-selected option from the selection.
  const visibleOptions = useMemo(() => {
    if (!query.trim()) return options;
    return options.filter((opt) => fieldSelectMenuMatches(opt.label, query));
  }, [options, query]);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <div className="flex min-h-0 flex-col">
      {showSearch ? (
        <FieldSelectMenuSearch
          query={query}
          onQueryChange={setQuery}
          placeholder={searchPlaceholder}
          dataAttr={dataAttr ? `${dataAttr}-search` : undefined}
        />
      ) : null}
      <div
        role="listbox"
        aria-multiselectable="true"
        data-attr={dataAttr}
        /* Never `flex-1` here — a zero flex-basis collapses the auto-height shell that
           makes a short list end early. `flex-[0_1_auto]` shrinks only under the cap. */
        className={cn(FIELD_SELECT_MENU_LISTBOX_SCROLL_CLASS, "min-h-0 flex-[0_1_auto]")}
        style={{
          touchAction: "pan-y",
          maxHeight: fieldSelectMenuListMaxHeightPx(
            shellMaxHeightPx,
            showSearch ? FIELD_SELECT_MENU_SEARCH_PX : 0,
          ),
        }}
      >
        {options.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted">{emptyMenuText}</p>
        ) : visibleOptions.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted">No matches</p>
        ) : (
          visibleOptions.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <label
                key={opt.value}
                role="option"
                aria-selected={checked}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm",
                  FIELD_SELECT_MENU_OPTION_CLASS,
                  checked && "bg-primary/5",
                )}
                onPointerDown={(event) =>
                  handlePortaledFieldSelectOptionPointerDown(event, () => toggle(opt.value))
                }
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
                  checked={checked}
                  readOnly
                  tabIndex={-1}
                  aria-hidden
                />
                <span className="leading-snug text-foreground">{opt.label}</span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Single-select list for filter menus (sort, one-of scope pickers) — same trigger + search + 5-row treatment. */
export function FilterSingleSelectList({
  options,
  value,
  onChange,
  dataAttr,
  onPick,
  searchPlaceholder = "Search…",
}: {
  options: Option[];
  value: string;
  onChange: (next: string) => void;
  dataAttr?: string;
  /** Called after a value is chosen (e.g. close the parent dropdown). */
  onPick?: () => void;
  searchPlaceholder?: string;
}) {
  const [query, setQuery] = useState("");
  const showSearch = FILTER_FIELD_MENU_ALWAYS_SHOW_SEARCH || options.length > FILTER_LIST_VISIBLE_ROWS;
  const shellMaxHeightPx = useFieldSelectMenuShellHeight(FILTER_MENU_CONTENT_PX);

  const visibleOptions = useMemo(() => {
    if (!query.trim()) return options;
    return options.filter((opt) => fieldSelectMenuMatches(opt.label, query));
  }, [options, query]);

  return (
    <div className="flex min-h-0 flex-col">
      {showSearch ? (
        <FieldSelectMenuSearch
          query={query}
          onQueryChange={setQuery}
          placeholder={searchPlaceholder}
          dataAttr={dataAttr ? `${dataAttr}-search` : undefined}
        />
      ) : null}
      <div
        role="listbox"
        data-attr={dataAttr}
        /* Never `flex-1` here — a zero flex-basis collapses the auto-height shell that
           makes a short list end early. `flex-[0_1_auto]` shrinks only under the cap. */
        className={cn(FIELD_SELECT_MENU_LISTBOX_SCROLL_CLASS, "min-h-0 flex-[0_1_auto]")}
        style={{
          touchAction: "pan-y",
          maxHeight: fieldSelectMenuListMaxHeightPx(
            shellMaxHeightPx,
            showSearch ? FIELD_SELECT_MENU_SEARCH_PX : 0,
          ),
        }}
      >
        {visibleOptions.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted">No matches</p>
        ) : (
          visibleOptions.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value || "__all__"}
                type="button"
                role="option"
                aria-selected={active}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm",
                  FIELD_SELECT_MENU_OPTION_CLASS,
                  active ? "bg-primary/10 text-foreground" : "text-foreground",
                )}
                onPointerDown={(event) =>
                  handlePortaledFieldSelectOptionPointerDown(event, () => {
                    onChange(opt.value);
                    onPick?.();
                  })
                }
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-primary" aria-hidden>
                  {active ? "✓" : ""}
                </span>
                <span className="leading-snug">{opt.label}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Convenience wrapper: label + portaled multi-select dropdown. */
export function FilterMultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  allLabel = "All",
  emptyMenuText = "No options",
  dataAttr,
  sectionId,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  allLabel?: string;
  emptyMenuText?: string;
  dataAttr?: string;
  sectionId?: string;
}) {
  return (
    <FilterCollapsibleSection
      sectionId={sectionId}
      label={label}
      summary={filterMultiSelectSummary(selected, options, allLabel)}
      empty={selected.length === 0}
      menuOptionCount={options.length}
      dataAttr={dataAttr ? `${dataAttr}-trigger` : undefined}
    >
      <FilterCheckboxList
        options={options}
        selected={selected}
        onChange={onChange}
        emptyMenuText={emptyMenuText}
        dataAttr={dataAttr}
      />
    </FilterCollapsibleSection>
  );
}

/** Convenience wrapper: label + portaled single-select dropdown. */
export function FilterSingleSelectDropdown({
  label,
  options,
  value,
  onChange,
  placeholder = "All",
  dataAttr,
  sectionId,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  dataAttr?: string;
  sectionId?: string;
}) {
  const closeDropdown = useFilterAccordionClose();
  const [open, setOpen] = useState(false);

  return (
    <FilterCollapsibleSection
      sectionId={sectionId}
      label={label}
      summary={filterSingleSelectSummary(value, options, placeholder)}
      empty={!value}
      menuOptionCount={options.length}
      dataAttr={dataAttr ? `${dataAttr}-trigger` : undefined}
      open={sectionId ? undefined : open}
      onOpenChange={sectionId ? undefined : setOpen}
    >
      <FilterSingleSelectList
        options={options}
        value={value}
        onChange={onChange}
        onPick={() => {
          closeDropdown();
          setOpen(false);
        }}
        dataAttr={dataAttr}
      />
    </FilterCollapsibleSection>
  );
}
