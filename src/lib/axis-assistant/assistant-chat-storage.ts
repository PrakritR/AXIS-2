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

export function assistantChatStorageKey(endpoint: string): string {
  const path = endpoint.trim() || "/api/agent/chat";
  return `axis:assistant-chat:v${STORAGE_VERSION}:${path}`;
}

export function loadAssistantChatMessages(endpoint: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(assistantChatStorageKey(endpoint));
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

export function saveAssistantChatMessages(endpoint: string, messages: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredPayload = {
      v: STORAGE_VERSION,
      messages: messages.slice(-MAX_STORED_MESSAGES),
    };
    window.localStorage.setItem(assistantChatStorageKey(endpoint), JSON.stringify(payload));
  } catch {
    /* quota or private mode */
  }
}

export function clearAssistantChatMessages(endpoint: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(assistantChatStorageKey(endpoint));
  } catch {
    /* ignore */
  }
}
