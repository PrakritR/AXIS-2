/**
 * Browser persistence for PropLane Assistant chat history (per agent endpoint).
 * Survives refresh; cleared on explicit reset. Text-only — attachments are not stored.
 */

import type { ChatMessage } from "@/lib/axis-assistant/use-assistant-conversation";

const STORAGE_VERSION = 1;
const MAX_STORED_MESSAGES = 40;

type StoredPayload = {
  v: number;
  messages: ChatMessage[];
};

export function assistantChatStorageKey(endpoint: string, storageScope?: string): string {
  const path = endpoint.trim() || "/api/agent/chat";
  const scope = storageScope?.trim();
  const base = `axis:assistant-chat:v${STORAGE_VERSION}:${path}`;
  return scope ? `${base}:${scope}` : base;
}

/** Stable slug for modal-scoped assistant threads (separate from the main dock/popup chat). */
export function modalAssistantStorageScope(contextKey: string, instance = 0): string {
  const slug =
    contextKey
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "modal";
  return instance > 0 ? `modal:${slug}:${instance}` : `modal:${slug}`;
}

export function loadAssistantChatMessages(endpoint: string, storageScope?: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(assistantChatStorageKey(endpoint, storageScope));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredPayload;
    if (parsed.v !== STORAGE_VERSION || !Array.isArray(parsed.messages)) return [];
    return parsed.messages
      .filter(
        (m): m is ChatMessage =>
          Boolean(m) &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0,
      )
      .slice(-MAX_STORED_MESSAGES);
  } catch {
    return [];
  }
}

export function saveAssistantChatMessages(
  endpoint: string,
  messages: ChatMessage[],
  storageScope?: string,
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredPayload = {
      v: STORAGE_VERSION,
      messages: messages.slice(-MAX_STORED_MESSAGES),
    };
    window.localStorage.setItem(assistantChatStorageKey(endpoint, storageScope), JSON.stringify(payload));
  } catch {
    /* quota or private mode */
  }
}

export function clearAssistantChatMessages(endpoint: string, storageScope?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(assistantChatStorageKey(endpoint, storageScope));
  } catch {
    /* ignore */
  }
}
