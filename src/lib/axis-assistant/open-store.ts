type Listener = () => void;

let open = false;
const listeners = new Set<Listener>();

export function getAxisAssistantOpen(): boolean {
  return open;
}

export function setAxisAssistantOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const listener of listeners) listener();
}

export function subscribeAxisAssistantOpen(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function openAxisAssistant(): void {
  setAxisAssistantOpen(true);
}

export function closeAxisAssistant(): void {
  setAxisAssistantOpen(false);
}
