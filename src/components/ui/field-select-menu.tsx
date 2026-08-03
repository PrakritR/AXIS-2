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
 * portaled menus look correct but cannot receive clicks and Vaul treats scroll as an
 * outside dismiss. Prefer the open Vaul sheet or filter panel host with absolute coords.
 */
export function resolveFieldSelectMenuPortal(): HTMLElement {
  const vaulSheet = document.querySelector<HTMLElement>(
    '[data-slot="vaul-bottom-sheet"][data-state="open"]',
  );
  if (vaulSheet) return vaulSheet;

  for (const selector of OPEN_FIELD_SELECT_MODAL_SELECTORS) {
    if (selector === '[data-slot="vaul-bottom-sheet"][data-state="open"]') continue;
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
  if (portalHost.matches('[data-slot="vaul-bottom-sheet"]')) return 100;
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

/**
 * Which way a menu opens, in FOUR ordered rules. The order is the whole design — do not
 * reorder them or fold them together:
 *
 * 1. Fits below → open down. `preferOpenDown` is a PREFERENCE, not a lock, and this is
 *    where it is honoured.
 * 2. Fits fully above → open UP, whatever the preference says. Rules 1 and 2 are the
 *    always-five-rows guarantee, so they come FIRST: a menu that would be clipped a row
 *    short below while the space above fits it whole must take the space above.
 * 3. Neither side fits and there is no preference → the roomier side wins.
 * 4. Neither side fits and down is preferred → hysteresis. Flipping up costs the user the
 *    established "filter menus open BELOW the trigger" placement, so it has to BUY at least
 *    one more whole option row ({@link FIELD_SELECT_MENU_ITEM_HEIGHT_PX}); otherwise a 1px
 *    difference flips the menu over the fields it was opened from for no visible gain. This
 *    arbitrates ONLY the leftover case where neither side can show five rows, which is
 *    exactly where the stickiness cannot cost a row.
 */
export function resolveOpenUp(
  spaceBelow: number,
  spaceAbove: number,
  contentPx: number,
  preferOpenDown: boolean,
): boolean {
  if (spaceBelow >= contentPx) return false;
  if (spaceAbove >= contentPx) return true;
  if (!preferOpenDown) return spaceAbove > spaceBelow;
  return spaceAbove >= spaceBelow + FIELD_SELECT_MENU_ITEM_HEIGHT_PX;
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
  options?: {
    minWidth?: number;
    hostPaddingPx?: number;
    preferOpenDown?: boolean;
    matchTriggerWidth?: boolean;
    /**
     * Viewport y (px) the menu may grow down to — a LAST RESORT, used only when the host
     * cannot fit `contentPx` on either side of the trigger. Containment is preferred: a
     * menu escaping its sheet onto the dimmed page reads as broken. But a host shorter than
     * the menu (a one-field sheet) would otherwise crush it to a single row, and showing
     * all five rows outranks staying inside. Omit to clamp to the host unconditionally.
     */
    bottomBoundPx?: number;
  },
): FieldSelectMenuRect {
  const hostRect = host.getBoundingClientRect();
  const rect = button.getBoundingClientRect();
  const gap = 4;
  const hostPadding = options?.hostPaddingPx ?? 12;
  const maxMenuWidth = Math.max(120, hostRect.width - hostPadding * 2);
  const minWidth = options?.minWidth ?? 0;
  const matchTriggerWidth = options?.matchTriggerWidth ?? false;
  const width = matchTriggerWidth
    ? rect.width
    : Math.min(Math.max(minWidth, rect.width), maxMenuWidth);

  let left = rect.left - hostRect.left;
  if (!matchTriggerWidth) {
    left = Math.min(Math.max(hostPadding, left), hostRect.width - width - hostPadding);
  }

  const spaceAbove = rect.top - hostRect.top - gap;
  const hostSpaceBelow = hostRect.bottom - rect.bottom - gap;
  const triggerTopInHost = rect.top - hostRect.top;
  const triggerBottomInHost = rect.bottom - hostRect.top;
  const preferOpenDown = options?.preferOpenDown ?? false;

  /*
   * Containment first. A menu that escapes its sheet onto the dimmed page reads as broken,
   * so whenever the HOST is tall enough to hold the whole menu we keep it inside — even
   * when neither side of the trigger alone has room, by sliding it back into the host's
   * box. That can overlap the trigger by the shortfall, which is the lesser cost: the
   * alternative is a menu hanging off the sheet, or one crushed below five rows.
   */
  const hostCanContainMenu = hostRect.height - gap * 2 >= contentPx;
  if (hostCanContainMenu) {
    const openUpInside = resolveOpenUp(hostSpaceBelow, spaceAbove, contentPx, preferOpenDown);
    const anchored = openUpInside
      ? triggerTopInHost - contentPx - gap
      : triggerBottomInHost + gap;
    const top = Math.min(Math.max(gap, anchored), hostRect.height - contentPx - gap);
    return { top, left, width, maxHeight: contentPx, position: "absolute" };
  }

  /* Host too short to hold the menu at all (a one-field sheet). Showing all five rows
     outranks staying inside, so fall back to the viewport bound when one was offered. */
  const bottomBound = options?.bottomBoundPx ?? hostRect.bottom;
  const spaceBelow = bottomBound - rect.bottom - gap;
  const openUp = resolveOpenUp(spaceBelow, spaceAbove, contentPx, preferOpenDown);
  const maxHeight = Math.min(
    contentPx,
    Math.max(FIELD_SELECT_MENU_ITEM_HEIGHT_PX + 12, openUp ? spaceAbove - gap : spaceBelow - gap),
  );
  const top = openUp
    ? Math.max(gap, triggerTopInHost - maxHeight - gap)
    : triggerBottomInHost + gap;

  return { top, left, width, maxHeight, position: "absolute" };
}

export function computeFieldSelectMenuRect(
  button: HTMLButtonElement,
  contentPx: number,
  _portalHost: HTMLElement,
  options?: { minWidth?: number; preferOpenDown?: boolean; matchTriggerWidth?: boolean },
): FieldSelectMenuRect {
  const rect = button.getBoundingClientRect();
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const viewportPadding = 12;
  const contentHeight = contentPx;
  const spaceBelow = viewportH - rect.bottom - viewportPadding;
  const spaceAbove = rect.top - viewportPadding;
  const preferOpenDown = options?.preferOpenDown ?? false;
  const matchTriggerWidth = options?.matchTriggerWidth ?? false;
  const openUp = resolveOpenUp(spaceBelow, spaceAbove, contentHeight, preferOpenDown);
  const maxHeight = Math.min(
    contentHeight,
    Math.max(FIELD_SELECT_MENU_ITEM_HEIGHT_PX + 12, openUp ? spaceAbove - 8 : spaceBelow - 8),
  );
  const minWidth = options?.minWidth ?? 0;
  const width = matchTriggerWidth
    ? rect.width
    : Math.min(minWidth > 0 ? minWidth : rect.width, viewportW - viewportPadding * 2);
  const left = matchTriggerWidth
    ? rect.left
    : Math.min(Math.max(viewportPadding, rect.left), viewportW - width - viewportPadding);
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
  preferOpenDown = false,
  matchTriggerWidth = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentPx: number;
  /** When set, the portaled menu is at least this wide (filter fields). */
  minMenuWidth?: number;
  /** `end` right-aligns the menu to the trigger (portal filter dropdown). */
  align?: "start" | "end";
  /** Portal filter fields always open below the trigger (mobile sheets, bottom fields). */
  preferOpenDown?: boolean;
  /** Align menu width/left to the trigger (mobile filter sheet edge-to-edge). */
  matchTriggerWidth?: boolean;
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
      const inVaulSheet =
        portalHost !== document.body && portalHost.matches('[data-slot="vaul-bottom-sheet"]');
      setMenuRect(
        align === "end"
          ? computePortalFilterDropdownRect(button, contentPx, { widthPx: minMenuWidth })
          : inFilterPanel || inVaulSheet
            ? computeFieldSelectMenuRectInHost(button, contentPx, portalHost, {
                minWidth: minMenuWidth,
                preferOpenDown: preferOpenDown || inVaulSheet,
                matchTriggerWidth: matchTriggerWidth || inVaulSheet,
                hostPaddingPx: inVaulSheet ? 0 : undefined,
                /* Both hosts are `overflow-visible`, so the menu may spill below them and
                   is bounded by the viewport instead — otherwise the bottom-most field of
                   a short sheet/panel opens a crushed one-row menu. */
                bottomBoundPx: window.innerHeight - 12,
              })
            : computeFieldSelectMenuRect(button, contentPx, portalHost, {
                minWidth: minMenuWidth,
                preferOpenDown,
                matchTriggerWidth,
              }),
      );
    };
    updateMenuRect();
    window.addEventListener("resize", updateMenuRect);
    window.addEventListener("scroll", updateMenuRect, true);
    return () => {
      window.removeEventListener("resize", updateMenuRect);
      window.removeEventListener("scroll", updateMenuRect, true);
    };
  }, [align, open, contentPx, minMenuWidth, preferOpenDown, matchTriggerWidth]);

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

/**
 * Search box shown at the top of a menu once its option list is long enough to scroll.
 * Its row uses `field-dropdown-menu-surface`, never `bg-card`: that token resolves to
 * `rgba(255,255,255,.94)` on some themes, which is invisible over the opaque menu shell
 * but plainly see-through wherever the menu overhangs the page behind it.
 */
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
    <div className="field-dropdown-menu-surface relative shrink-0 border-b border-border px-2 py-2">
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
