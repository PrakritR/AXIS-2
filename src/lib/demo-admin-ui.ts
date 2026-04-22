/** Cross-slice client refresh: admin banners, scheduling UIs, inbox, and other localStorage-backed demos. */
export const ADMIN_UI_EVENT = "axis_admin_ui_refresh";

export function emitAdminUi() {
  if (typeof window === "undefined") return;
  queueMicrotask(() => {
    window.dispatchEvent(new Event(ADMIN_UI_EVENT));
  });
}
