/**
 * State for the site-wide GENERAL assistant. Kept separate from the portal
 * `axis-assistant/open-store` so the two assistants (portal-scoped vs general)
 * open, close, and render fully independently — even when both are on screen
 * (e.g. the /demo page).
 */
type Listener = () => void;

let open = false;
const openListeners = new Set<Listener>();

export function getGeneralAssistantOpen(): boolean {
  return open;
}

export function setGeneralAssistantOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const listener of openListeners) listener();
}

export function subscribeGeneralAssistantOpen(listener: Listener): () => void {
  openListeners.add(listener);
  return () => openListeners.delete(listener);
}

export function openGeneralAssistant(): void {
  setGeneralAssistantOpen(true);
}

export function closeGeneralAssistant(): void {
  setGeneralAssistantOpen(false);
}

// --- portal-assistant presence -----------------------------------------------
// The portal Axis Assistant registers here while mounted so the site-wide
// general FAB can offset itself and avoid stacking on top of the portal FAB
// (both are pinned bottom-right). This is a reference count: nested/overlapping
// mounts are handled, and the last unmount clears it.
let portalAssistantCount = 0;
const presenceListeners = new Set<Listener>();

export function getPortalAssistantPresent(): boolean {
  return portalAssistantCount > 0;
}

export function subscribePortalAssistantPresence(listener: Listener): () => void {
  presenceListeners.add(listener);
  return () => presenceListeners.delete(listener);
}

/** Called by the portal Axis Assistant on mount; returns an unregister fn. */
export function registerPortalAssistant(): () => void {
  portalAssistantCount += 1;
  if (portalAssistantCount === 1) for (const l of presenceListeners) l();
  return () => {
    portalAssistantCount = Math.max(0, portalAssistantCount - 1);
    if (portalAssistantCount === 0) for (const l of presenceListeners) l();
  };
}
