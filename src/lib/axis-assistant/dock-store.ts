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
