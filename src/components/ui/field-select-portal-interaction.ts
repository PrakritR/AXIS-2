import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Portaled field-select menus sit outside Radix/Vaul modal trees. Modal shells call
 * `preventDefault` on outside listbox pointerdown to avoid dismiss — that blocks native
 * checkbox clicks. Toggle selection on pointerdown instead.
 */
export function handlePortaledFieldSelectOptionPointerDown(
  event: ReactPointerEvent,
  action: () => void,
): void {
  event.preventDefault();
  event.stopPropagation();
  action();
}

/**
 * Defer closing a portaled field menu until after the browser finishes the pick
 * gesture. Closing synchronously on pointerdown unmounts the menu before the
 * follow-up click lands, which on mobile can hit the sheet overlay and dismiss
 * the whole filter panel.
 */
export function deferAfterFieldSelectPick(action: () => void): void {
  queueMicrotask(action);
}

/** Menu roots portaled into open modal shells or `document.body` — modal outside-click handlers must ignore these. */
export const FIELD_SELECT_MENU_DATA_ATTR = "data-field-select-menu";

export function isPortaledFieldSelectMenuTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest(`[${FIELD_SELECT_MENU_DATA_ATTR}]`) || target.closest('[role="listbox"]'));
}
