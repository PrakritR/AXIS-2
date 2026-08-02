"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useIsClient } from "@/hooks/use-is-client";
import { FIELD_SELECT_MENU_DATA_ATTR } from "@/components/ui/field-select-portal-interaction";

/**
 * Shared machinery for the one portaled field-select dropdown pattern used by
 * `CheckboxMultiSelect` / `FieldSingleSelect` (form + toolbar fields) and by the
 * portal filter fields (`filter-field-lists.tsx`). The menu is rendered into an
 * open modal/drawer shell (or `document.body` as a fallback) so it overlays the
 * trigger instead of pushing sibling controls down or resizing the panel, and it
 * caps its option list at {@link FIELD_SELECT_MENU_VISIBLE_ITEMS} rows and scrolls
 * the rest. Do not fork a second positioning implementation — extend this one.
 */

/** Rows visible before the option list starts scrolling. Single source of the "5". */
export const FIELD_SELECT_MENU_VISIBLE_ITEMS = 5;
export const FIELD_SELECT_MENU_ITEM_HEIGHT_PX = 40;
/** Height reserved for the in-menu search row (input + padding). */
export const FIELD_SELECT_MENU_SEARCH_PX = 52;

/**
 * Height of exactly 5 option rows. The cap is applied to the portaled SHELL (via
 * {@link fieldSelectMenuContentPx} → `menuRect.maxHeight`), not to the list itself,
 * so a short list keeps the menu sized to its real content.
 */
export const FIELD_SELECT_MENU_LIST_MAX_HEIGHT_PX =
  FIELD_SELECT_MENU_VISIBLE_ITEMS * FIELD_SELECT_MENU_ITEM_HEIGHT_PX;

/** Portaled surface (border/shadow/opaque bg) that overlays the trigger. */
export const FIELD_SELECT_MENU_SHELL_CLASS =
  "field-dropdown-menu flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border shadow-[0_16px_40px_-12px_rgba(15,23,42,0.35)]";

/** Scrollable option list — a shrinkable flex child (`flex: 0 1 auto`) so the shell
 * still sizes to its real content and the list scrolls once the shell hits its cap.
 * Never `flex-1` here: a zero flex-basis collapses the auto-height shell.
 */
export const FIELD_SELECT_MENU_LISTBOX_SCROLL_CLASS =
  "min-h-0 overflow-y-auto overscroll-contain py-1 [-webkit-overflow-scrolling:touch]";

/** Short menus (≤5 options, no search) — size to content with no inner scrollbar. */
export const FIELD_SELECT_MENU_LISTBOX_FIT_CLASS = "overflow-visible py-1";

export function fieldSelectMenuFitsWithoutScroll(optionCount: number, searchPx = 0): boolean {
  return searchPx === 0 && optionCount <= FIELD_SELECT_MENU_VISIBLE_ITEMS;
}

const FIELD_SELECT_MENU_SEARCH_INPUT_CLASS =
  "h-9 w-full rounded-xl border border-border bg-auth-input-bg pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/10";

const OPEN_FIELD_SELECT_MODAL_SELECTORS = [
  '[data-slot="modal-vaul-drawer"][data-state="open"]',
  '[data-slot="modal-radix-dialog"][data-state="open"]',
  '[data-slot="vaul-bottom-sheet"][data-state="open"]',
];

/**
 * Portal menus into an open modal/drawer shell when present. Radix `hideOthers` and Vaul
 * mark every `document.body` sibling outside the dialog tree as aria-hidden, so body-
 * portaled menus look correct but cannot receive clicks. Body fallback keeps viewport
 * `fixed` coords for non-modal surfaces (filters, tables, etc.). Filter dropdown panels
 * intentionally use body too — their centering transform would trap `position: fixed`
 * menus and clip option lists.
 */
export function resolveFieldSelectMenuPortal(): HTMLElement {
  const vaulSheet = document.querySelector<HTMLElement>(
    '[data-slot="vaul-bottom-sheet"][data-state="open"]',
  );
  // Vaul animates with transform; `position: fixed` menus must use viewport/body coords.
  if (vaulSheet) return document.body;

  for (const selector of OPEN_FIELD_SELECT_MODAL_SELECTORS) {
    const host = document.querySelector<HTMLElement>(selector);
    if (host) return host;
  }
  const openFilterPanel = document.querySelector<HTMLElement>(
    '[data-slot="portal-filter-dropdown-panel"]',
  );
  if (openFilterPanel) return openFilterPanel;
  return document.body;
}

export function fieldSelectMenuZIndex(portalHost: HTMLElement): number {
  if (portalHost === document.body) return 10000;
  if (portalHost.matches('[data-slot="portal-filter-dropdown-panel"]')) return 30;
  return 80;
}

export type FieldSelectMenuRect = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  position: "fixed" | "absolute";
};

/**
 * Content height for `count` option rows (capped at 5) plus optional `extraPx`
 * (e.g. a search row). Callers pass this to size the menu and decide open-up.
 */
export function fieldSelectMenuContentPx(count: number, extraPx = 0): number {
  const rows = Math.min(Math.max(count, 1), FIELD_SELECT_MENU_VISIBLE_ITEMS);
  return rows * FIELD_SELECT_MENU_ITEM_HEIGHT_PX + 12 + extraPx;
}

/** Scrollable list height inside a portaled menu shell (search row excluded). */
export function fieldSelectMenuListMaxHeightPx(shellMaxHeight: number, searchPx = 0): number {
  return Math.max(
    FIELD_SELECT_MENU_ITEM_HEIGHT_PX,
    shellMaxHeight - searchPx - 8,
  );
}

/** Right-align a fixed filter panel to its trigger and clamp inside the viewport. */
export function computePortalFilterDropdownRect(
  button: HTMLButtonElement,
  panelHeightPx: number,
  options?: { widthPx?: number },
): FieldSelectMenuRect {
  const rect = button.getBoundingClientRect();
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const viewportPadding = 12;
  const preferredWidth = options?.widthPx ?? 22 * 16;
  const width = Math.min(preferredWidth, viewportW - viewportPadding * 2);

  let left = rect.right - width;
  left = Math.min(Math.max(viewportPadding, left), viewportW - width - viewportPadding);

  const gap = 8;
  const spaceBelow = viewportH - rect.bottom - viewportPadding;
  const spaceAbove = rect.top - viewportPadding;
  const openUp = spaceBelow < panelHeightPx && spaceAbove > spaceBelow;
  const maxHeight = Math.min(
    panelHeightPx,
    Math.max(120, openUp ? spaceAbove - gap : spaceBelow - gap),
  );
  const top = openUp
    ? Math.max(viewportPadding, rect.top - maxHeight - gap)
    : rect.bottom + gap;

  return { top, left, width, maxHeight, position: "fixed" };
}

/** Position a field menu inside an open filter dropdown (or other non-body host). */
export function computeFieldSelectMenuRectInHost(
  button: HTMLButtonElement,
  contentPx: number,
  host: HTMLElement,
  options?: { minWidth?: number; hostPaddingPx?: number; preferOpenDown?: boolean },
): FieldSelectMenuRect {
  const hostRect = host.getBoundingClientRect();
  const rect = button.getBoundingClientRect();
  const gap = 4;
  const hostPadding = options?.hostPaddingPx ?? 12;
  const maxMenuWidth = Math.max(120, hostRect.width - hostPadding * 2);
  const minWidth = options?.minWidth ?? 0;
  const width = Math.min(Math.max(minWidth, rect.width), maxMenuWidth);

  let left = rect.left - hostRect.left;
  left = Math.min(Math.max(hostPadding, left), hostRect.width - width - hostPadding);

  const spaceBelow = hostRect.bottom - rect.bottom - gap;
  const spaceAbove = rect.top - hostRect.top - gap;
  const preferOpenDown = options?.preferOpenDown ?? false;
  const openUp = !preferOpenDown && spaceBelow < contentPx && spaceAbove > spaceBelow;
  const maxHeight = preferOpenDown
    ? contentPx
    : Math.min(
        contentPx,
        Math.max(
          FIELD_SELECT_MENU_ITEM_HEIGHT_PX + 12,
          openUp ? spaceAbove - gap : spaceBelow - gap,
        ),
      );
  const top = openUp
    ? Math.max(gap, rect.top - hostRect.top - maxHeight - gap)
    : rect.bottom - hostRect.top + gap;

  return { top, left, width, maxHeight, position: "absolute" };
}

export function computeFieldSelectMenuRect(
  button: HTMLButtonElement,
  contentPx: number,
  _portalHost: HTMLElement,
  options?: { minWidth?: number },
): FieldSelectMenuRect {
  const rect = button.getBoundingClientRect();
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const viewportPadding = 12;
  const contentHeight = contentPx;
  const spaceBelow = viewportH - rect.bottom - viewportPadding;
  const spaceAbove = rect.top - viewportPadding;
  const openUp = spaceBelow < contentHeight && spaceAbove > spaceBelow;
  const viewportCap = Math.max(
    FIELD_SELECT_MENU_ITEM_HEIGHT_PX + 12,
    openUp ? spaceAbove - 8 : spaceBelow - 8,
  );
  const maxHeight = Math.min(contentHeight, viewportCap);
  const minWidth = options?.minWidth ?? 0;
  const width = Math.min(
    minWidth > 0 ? minWidth : rect.width,
    viewportW - viewportPadding * 2,
  );
  const left = Math.min(
    Math.max(viewportPadding, rect.left),
    viewportW - width - viewportPadding,
  );
  const top = openUp
    ? Math.max(viewportPadding, rect.top - maxHeight - 4)
    : rect.bottom + 4;
  return {
    top,
    left,
    width,
    maxHeight,
    position: "fixed",
  };
}

/**
 * Owns the portaled-menu lifecycle for one trigger: rect computation (re-run on
 * scroll/resize), outside-pointerdown to close, and Escape to close + return focus
 * to the trigger. `open` is controlled by the caller so it can be driven by an
 * accordion (one-open-at-a-time) or local state.
 */
export function useFieldSelectMenu({
  open,
  onOpenChange,
  contentPx,
  minMenuWidth,
  align = "start",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentPx: number;
  /** When set, the portaled menu is at least this wide (filter fields). */
  minMenuWidth?: number;
  /** `end` right-aligns the menu to the trigger (portal filter dropdown). */
  align?: "start" | "end";
}) {
  const listId = useId();
  const isClient = useIsClient();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuRect, setMenuRect] = useState<FieldSelectMenuRect | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuRect(null);
      return;
    }
    const updateMenuRect = () => {
      const button = buttonRef.current;
      if (!button) return;
      const portalHost = resolveFieldSelectMenuPortal();
      const inFilterPanel =
        portalHost !== document.body &&
        portalHost.matches('[data-slot="portal-filter-dropdown-panel"]');
      setMenuRect(
        align === "end"
          ? computePortalFilterDropdownRect(button, contentPx, { widthPx: minMenuWidth })
          : inFilterPanel
            ? computeFieldSelectMenuRectInHost(button, contentPx, portalHost, {
                minWidth: minMenuWidth,
                preferOpenDown: true,
              })
            : computeFieldSelectMenuRect(button, contentPx, portalHost, { minWidth: minMenuWidth }),
      );
    };
    updateMenuRect();
    window.addEventListener("resize", updateMenuRect);
    window.addEventListener("scroll", updateMenuRect, true);
    return () => {
      window.removeEventListener("resize", updateMenuRect);
      window.removeEventListener("scroll", updateMenuRect, true);
    };
  }, [align, open, contentPx, minMenuWidth]);

  useEffect(() => {
    if (!open) return;
    const onPointerDownOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (wrapRef.current?.contains(target)) return;
      if (target instanceof HTMLElement && target.closest('[data-slot="portal-filter-dropdown-panel"]')) return;
      // A click inside ANY portaled field-select menu must not close this one.
      if (target instanceof HTMLElement && target.closest(`[${FIELD_SELECT_MENU_DATA_ATTR}]`)) return;
      if (document.getElementById(listId)?.contains(target)) return;
      onOpenChangeRef.current(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChangeRef.current(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDownOutside, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDownOutside, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [listId, open]);

  const portalHost = menuRect && isClient ? resolveFieldSelectMenuPortal() : null;
  return { listId, isClient, wrapRef, buttonRef, menuRect, portalHost };
}

/** Search box shown at the top of a menu once its option list is long enough to scroll. */
export function FieldSelectMenuSearch({
  query,
  onQueryChange,
  placeholder = "Search…",
  dataAttr,
}: {
  query: string;
  onQueryChange: (next: string) => void;
  placeholder?: string;
  dataAttr?: string;
}) {
  return (
    <div className="relative shrink-0 border-b border-border bg-card px-2 py-2">
      <Search
        className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
      <input
        type="text"
        inputMode="search"
        autoComplete="off"
        className={FIELD_SELECT_MENU_SEARCH_INPUT_CLASS}
        placeholder={placeholder}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        data-attr={dataAttr}
      />
    </div>
  );
}

/** Case-insensitive substring match used by every searchable field-select menu. */
export function fieldSelectMenuMatches(label: string, query: string): boolean {
  return label.toLowerCase().includes(query.trim().toLowerCase());
}
