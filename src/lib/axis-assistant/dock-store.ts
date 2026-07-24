import { ASSISTANT_DOCK_COLLAPSED_COOKIE } from "@/lib/assistant-dock-cookie";

type Listener = () => void;

let collapsed = false;
const listeners = new Set<Listener>();

export function getAssistantDockCollapsed(): boolean {
  return collapsed;
}

export function setAssistantDockCollapsed(next: boolean): void {
  if (collapsed === next) return;
  collapsed = next;
  // #region agent log
  fetch('http://127.0.0.1:7293/ingest/77aa960a-bec3-48b1-bf3d-3eb4c10cfddf',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'81cbea'},body:JSON.stringify({sessionId:'81cbea',location:'dock-store.ts:setAssistantDockCollapsed',message:'dock collapse state changed',data:{collapsed:next},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
  // #endregion
  if (typeof document !== "undefined") {
    document.cookie = `${ASSISTANT_DOCK_COLLAPSED_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.toggleAttribute("data-assistant-dock-collapsed", next);
    document.documentElement.toggleAttribute("data-assistant-dock-expanded", !next);
  }
  for (const listener of listeners) listener();
}

export function subscribeAssistantDockCollapsed(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function initAssistantDockCollapsed(initial: boolean): void {
  collapsed = initial;
  if (typeof document !== "undefined") {
    document.documentElement.toggleAttribute("data-assistant-dock-collapsed", initial);
    document.documentElement.toggleAttribute("data-assistant-dock-expanded", !initial);
  }
}

export function expandAssistantDock(): void {
  setAssistantDockCollapsed(false);
}

export function collapseAssistantDock(): void {
  setAssistantDockCollapsed(true);
}

export function toggleAssistantDock(): void {
  setAssistantDockCollapsed(!collapsed);
}
