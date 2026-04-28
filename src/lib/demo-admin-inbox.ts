import { emitAdminUi } from "@/lib/demo-admin-ui";

let unopenedCount = 0;

function isBrowser() {
  return typeof window !== "undefined";
}

export function readAdminInboxUnopened(): number {
  if (!isBrowser()) return 0;
  return unopenedCount;
}

export function incrementAdminInboxUnopened() {
  if (!isBrowser()) return;
  unopenedCount = readAdminInboxUnopened() + 1;
  emitAdminUi();
}
