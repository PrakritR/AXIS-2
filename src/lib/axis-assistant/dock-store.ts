import {
  ASSISTANT_DOCK_COLLAPSED_COOKIE,
  ASSISTANT_DOCKED_COOKIE,
} from "@/lib/assistant-dock-cookie";

type Listener = () => void;

let collapsed = true;
let docked = false;
const listeners = new Set<Listener>();

function syncDomAttributes() {
  if (typeof document === "undefined") return;
  document.documentElement.toggleAttribute("data-assistant-dock-collapsed", collapsed);
  document.documentElement.toggleAttribute("data-assistant-dock-expanded", docked && !collapsed);
  document.documentElement.toggleAttribute("data-assistant-docked", docked);
}

function notify() {
  for (const listener of listeners) listener();
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function getAssistantDockCollapsed(): boolean {
  return collapsed;
}

export function getAssistantDocked(): boolean {
  return docked;
}

export function setAssistantDockCollapsed(next: boolean): void {
  if (collapsed === next) return;
  collapsed = next;
  writeCookie(ASSISTANT_DOCK_COLLAPSED_COOKIE, next ? "1" : "0");
  syncDomAttributes();
  notify();
}

export function setAssistantDocked(next: boolean): void {
  if (docked === next) return;
  docked = next;
  writeCookie(ASSISTANT_DOCKED_COOKIE, next ? "1" : "0");
  syncDomAttributes();
  notify();
}

export function subscribeAssistantDockCollapsed(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function subscribeAssistantDocked(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function initAssistantDockState(initial: { collapsed: boolean; docked: boolean }): void {
  collapsed = initial.collapsed;
  docked = initial.docked;
  syncDomAttributes();
}

export function expandAssistantDock(): void {
  setAssistantDocked(true);
  setAssistantDockCollapsed(false);
}

export function collapseAssistantDock(): void {
  setAssistantDockCollapsed(true);
}

export function toggleAssistantDock(): void {
  setAssistantDockCollapsed(!collapsed);
}

/** Pin the assistant to the right rail (closes the popup). */
export function dockAssistantToRail(): void {
  expandAssistantDock();
}

/** Return to popup-only mode and hide the right rail. */
export function undockAssistantFromRail(): void {
  setAssistantDocked(false);
  setAssistantDockCollapsed(true);
}
