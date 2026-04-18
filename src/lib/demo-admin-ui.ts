/** Cross-slice client refresh for admin UIs backed by localStorage demos. */
export const ADMIN_UI_EVENT = "axis_admin_ui_refresh";

export function emitAdminUi() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ADMIN_UI_EVENT));
  }
}
