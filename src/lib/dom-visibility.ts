/**
 * True when `el` is actually rendered on screen (has a layout box), as
 * opposed to a CSS-hidden (`display:none`) duplicate. `offsetParent` is null
 * for `display:none` elements AND their descendants, which is exactly the
 * signal needed to tell a `lg:hidden` / `hidden lg:block` duplicate mount
 * apart from the one the resident is actually looking at. Any stateful or
 * side-effecting component embedded in one of the portal's dual-mount
 * (mobile-card + desktop-table) lists must gate its effects on this — see the
 * dual-mount invariant in AGENTS.md.
 */
export function isElementOnScreen(el: HTMLElement | null): boolean {
  return Boolean(el?.offsetParent);
}
