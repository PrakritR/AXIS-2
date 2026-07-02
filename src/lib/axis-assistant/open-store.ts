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

// --- scripted prompt channel (used by the /demo "Run demo" auto-play) ---------
type PromptListener = (prompt: string) => void;
const promptListeners = new Set<PromptListener>();

export function subscribeAxisAssistantPrompt(listener: PromptListener): () => void {
  promptListeners.add(listener);
  return () => promptListeners.delete(listener);
}

/** Open the assistant and submit a prompt programmatically. */
export function sendAxisAssistantPrompt(prompt: string): void {
  openAxisAssistant();
  for (const listener of promptListeners) listener(prompt);
}
