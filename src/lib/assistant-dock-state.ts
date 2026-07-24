import { cookies } from "next/headers";

import { ASSISTANT_DOCK_COLLAPSED_COOKIE, ASSISTANT_DOCKED_COOKIE } from "@/lib/assistant-dock-cookie";

export { ASSISTANT_DOCK_COLLAPSED_COOKIE, ASSISTANT_DOCKED_COOKIE };

/** Persists desktop assistant rail collapsed state for SSR (default collapsed). */
export async function getAssistantDockCollapsed(): Promise<boolean> {
  const store = await cookies();
  const raw = store.get(ASSISTANT_DOCK_COLLAPSED_COOKIE)?.value;
  if (raw === undefined) return true;
  return raw === "1";
}

/** True when the assistant is pinned to the right rail (popup is the default). */
export async function getAssistantDocked(): Promise<boolean> {
  const store = await cookies();
  return store.get(ASSISTANT_DOCKED_COOKIE)?.value === "1";
}
