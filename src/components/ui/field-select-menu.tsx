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

/** Max height of the scrollable option list: exactly 5 rows. */
export const FIELD_SELECT_MENU_LIST_MAX_HEIGHT_PX =
  FIELD_SELECT_MENU_VISIBLE_ITEMS * FIELD_SELECT_MENU_ITEM_HEIGHT_PX;

/** Portaled surface (border/shadow/opaque bg) that overlays the trigger. */
export const FIELD_SELECT_MENU_SHELL_CLASS =
  "field-dropdown-menu flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border shadow-[0_16px_40px_-12px_rgba(15,23,42,0.35)]";

/** Scrollable option list — flex child so it shrinks inside a viewport-capped shell. */
export const FIELD_SELECT_MENU_LISTBOX_SCROLL_CLASS =
  "min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 [-webkit-overflow-scrolling:touch]";

const FIELD_SELECT_MENU_SEARCH_INPUT_CLASS =
  "h-9 w-full rounded-xl border border-border bg-auth-input-bg pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/10";

const OPEN_FIELD_SELECT_MODAL_SELECTORS = [
  '[data-slot="modal-vaul-drawer"][data-state="open"]',
  '[data-slot="modal-radix-dialog"][data-state="open"]',
  '[data-slot="vaul-bottom-sheet"][data-state="open"]',
  '[data-slot="portal-filter-dropdown-panel"]',
];

/**
 * Portal menus into an open modal/drawer shell when present. Radix `hideOthers` and Vaul
 * mark every `document.body` sibling outside the dialog tree as aria-hidden, so body-
 * portaled menus look correct but cannot receive clicks. Body fallback keeps viewport
 * `fixed` coords for non-modal surfaces (filters, tables, etc.).
 */
export function resolveFieldSelectMenuPortal(): HTMLElement {
  for (const selector of OPEN_FIELD_SELECT_MODAL_SELECTORS) {
    const host = document.querySelector<HTMLElement>(selector);
    if (host) return host;
  }
  return document.body;
}

export function fieldSelectMenuZIndex(portalHost: HTMLElement): number {
  return portalHost === document.body ? 10000 : 80;
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

export function computeFieldSelectMenuRect(
  button: HTMLButtonElement,
  contentPx: number,
  _portalHost: HTMLElement,
): FieldSelectMenuRect {
  const rect = button.getBoundingClientRect();
  const viewportH = window.innerHeight;
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
  const top = openUp
    ? Math.max(viewportPadding, rect.top - maxHeight - 4)
    : rect.bottom + 4;
  return {
    top,
    left: rect.left,
    width: rect.width,
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentPx: number;
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
      setMenuRect(computeFieldSelectMenuRect(button, contentPx, resolveFieldSelectMenuPortal()));
    };
    updateMenuRect();
    window.addEventListener("resize", updateMenuRect);
    window.addEventListener("scroll", updateMenuRect, true);
    return () => {
      window.removeEventListener("resize", updateMenuRect);
      window.removeEventListener("scroll", updateMenuRect, true);
    };
  }, [open, contentPx]);

  useEffect(() => {
    if (!open) return;
    const onPointerDownOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (wrapRef.current?.contains(target)) return;
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
