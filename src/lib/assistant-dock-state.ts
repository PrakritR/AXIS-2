import { cookies } from "next/headers";

import { ASSISTANT_DOCK_COLLAPSED_COOKIE } from "@/lib/assistant-dock-cookie";

export { ASSISTANT_DOCK_COLLAPSED_COOKIE };

/** Persists desktop assistant rail collapsed state for SSR (default expanded). */
export async function getAssistantDockCollapsed(): Promise<boolean> {
  const store = await cookies();
  return store.get(ASSISTANT_DOCK_COLLAPSED_COOKIE)?.value === "1";
}
