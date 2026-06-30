import { cookies } from "next/headers";
import { SIDEBAR_COLLAPSED_COOKIE } from "@/lib/portal-sidebar-cookie";

export { SIDEBAR_COLLAPSED_COOKIE };

/** Persists the desktop sidebar collapsed state so SSR matches the client (no flash). */
export async function getSidebarCollapsed(): Promise<boolean> {
  const store = await cookies();
  return store.get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1";
}
