import { emitAdminUi } from "@/lib/demo-admin-ui";

const KEY = "axis_admin_inbox_unopened_v1";

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readAdminInboxUnopened(): number {
  if (!isBrowser()) return 0;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw == null) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function incrementAdminInboxUnopened() {
  if (!isBrowser()) return;
  try {
    const next = readAdminInboxUnopened() + 1;
    window.localStorage.setItem(KEY, String(next));
    emitAdminUi();
  } catch {
    /* ignore */
  }
}
