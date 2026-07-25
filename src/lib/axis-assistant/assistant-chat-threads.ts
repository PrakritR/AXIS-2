/**
 * Multi-conversation archive for the main PropLane assistant (popup + dock).
 * Modal-scoped assistants keep a single ephemeral thread via assistant-chat-storage.
 */

import type { ChatMessage } from "@/lib/axis-assistant/use-assistant-conversation";
import {
  assistantChatStorageKey,
  clearAssistantChatMessages,
  loadAssistantChatMessages,
} from "@/lib/axis-assistant/assistant-chat-storage";

const THREADS_VERSION = 1;
const MAX_THREADS = 40;
const MAX_MESSAGES_PER_THREAD = 40;

export type AssistantChatThreadSummary = {
  id: string;
  title: string;
  updatedAt: number;
};

export type AssistantChatThread = AssistantChatThreadSummary & {
  messages: ChatMessage[];
};

type ThreadIndexPayload = {
  v: number;
  activeId: string;
  threads: AssistantChatThread[];
};

function threadsStorageKey(endpoint: string): string {
  return `${assistantChatStorageKey(endpoint)}:threads`;
}

function newThreadId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function threadTitleFromMessages(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New conversation";
  const stripped = firstUser.content.replace(/^\[Context:[^\]]+\]\s*\n+/i, "").trim();
  const line = stripped.split("\n")[0]?.trim() ?? "";
  if (!line) return "New conversation";
  return line.length > 52 ? `${line.slice(0, 49)}…` : line;
}

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter(
      (m): m is ChatMessage =>
        Boolean(m) &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .slice(-MAX_MESSAGES_PER_THREAD);
}

function readIndex(endpoint: string): ThreadIndexPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(threadsStorageKey(endpoint));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ThreadIndexPayload;
    if (parsed.v !== THREADS_VERSION || !Array.isArray(parsed.threads) || !parsed.activeId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeIndex(endpoint: string, payload: ThreadIndexPayload): void {
  if (typeof window === "undefined") return;
  try {
    const threads = [...payload.threads]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_THREADS)
      .map((t) => ({
        ...t,
        messages: normalizeMessages(t.messages),
        title: t.title?.trim() || threadTitleFromMessages(t.messages),
      }));
    let activeId = payload.activeId;
    if (!threads.some((t) => t.id === activeId)) {
      activeId = threads[0]?.id ?? newThreadId();
    }
    window.localStorage.setItem(
      threadsStorageKey(endpoint),
      JSON.stringify({ v: THREADS_VERSION, activeId, threads } satisfies ThreadIndexPayload),
    );
  } catch {
    /* quota */
  }
}

/** Import a legacy single-thread localStorage blob into the thread index once. */
export function migrateLegacyAssistantChatToThreads(endpoint: string): void {
  if (typeof window === "undefined") return;
  if (readIndex(endpoint)) return;
  const legacy = loadAssistantChatMessages(endpoint);
  const id = newThreadId();
  const now = Date.now();
  const threads: AssistantChatThread[] =
    legacy.length > 0
      ? [
          {
            id,
            title: threadTitleFromMessages(legacy),
            updatedAt: now,
            messages: normalizeMessages(legacy),
          },
        ]
      : [
          {
            id,
            title: "New conversation",
            updatedAt: now,
            messages: [],
          },
        ];
  writeIndex(endpoint, { v: THREADS_VERSION, activeId: id, threads });
  clearAssistantChatMessages(endpoint);
}

export function loadAssistantThreadState(endpoint: string): {
  activeThreadId: string;
  threads: AssistantChatThreadSummary[];
  messages: ChatMessage[];
} {
  migrateLegacyAssistantChatToThreads(endpoint);
  const index = readIndex(endpoint);
  if (!index) {
    const id = newThreadId();
    const empty: AssistantChatThread = { id, title: "New conversation", updatedAt: Date.now(), messages: [] };
    writeIndex(endpoint, { v: THREADS_VERSION, activeId: id, threads: [empty] });
    return { activeThreadId: id, threads: [{ id, title: empty.title, updatedAt: empty.updatedAt }], messages: [] };
  }
  const active =
    index.threads.find((t) => t.id === index.activeId) ??
    index.threads[0] ?? { id: index.activeId, title: "New conversation", updatedAt: Date.now(), messages: [] };
  const summaries = [...index.threads]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt }));
  return {
    activeThreadId: active.id,
    threads: summaries,
    messages: normalizeMessages(active.messages),
  };
}

export function persistAssistantThreadMessages(
  endpoint: string,
  activeThreadId: string,
  messages: ChatMessage[],
): AssistantChatThreadSummary[] {
  migrateLegacyAssistantChatToThreads(endpoint);
  const index = readIndex(endpoint);
  const now = Date.now();
  const normalized = normalizeMessages(messages);
  const title = threadTitleFromMessages(normalized);
  const threads = index?.threads ?? [];
  const existing = threads.find((t) => t.id === activeThreadId);
  const nextThread: AssistantChatThread = {
    id: activeThreadId,
    title: normalized.length ? title : existing?.title ?? "New conversation",
    updatedAt: now,
    messages: normalized,
  };
  const without = threads.filter((t) => t.id !== activeThreadId);
  writeIndex(endpoint, {
    v: THREADS_VERSION,
    activeId: activeThreadId,
    threads: [nextThread, ...without],
  });
  return loadAssistantThreadState(endpoint).threads;
}

export function switchAssistantThread(
  endpoint: string,
  threadId: string,
  persistCurrent?: { id: string; messages: ChatMessage[] },
): {
  activeThreadId: string;
  messages: ChatMessage[];
  threads: AssistantChatThreadSummary[];
} {
  if (persistCurrent?.id && persistCurrent.messages.length > 0) {
    persistAssistantThreadMessages(endpoint, persistCurrent.id, persistCurrent.messages);
  }
  const state = loadAssistantThreadState(endpoint);
  const target = state.threads.find((t) => t.id === threadId);
  if (!target) return { activeThreadId: state.activeThreadId, messages: state.messages, threads: state.threads };
  const index = readIndex(endpoint)!;
  const full = index.threads.find((t) => t.id === threadId);
  writeIndex(endpoint, { ...index, activeId: threadId });
  return {
    activeThreadId: threadId,
    messages: normalizeMessages(full?.messages ?? []),
    threads: loadAssistantThreadState(endpoint).threads,
  };
}

export function startNewAssistantThread(endpoint: string, currentThreadId: string, currentMessages: ChatMessage[]): {
  activeThreadId: string;
  messages: ChatMessage[];
  threads: AssistantChatThreadSummary[];
} {
  if (currentMessages.length > 0) {
    persistAssistantThreadMessages(endpoint, currentThreadId, currentMessages);
  }
  const id = newThreadId();
  const empty: AssistantChatThread = { id, title: "New conversation", updatedAt: Date.now(), messages: [] };
  const index = readIndex(endpoint);
  const threads = index?.threads ?? [];
  writeIndex(endpoint, {
    v: THREADS_VERSION,
    activeId: id,
    threads: [empty, ...threads.filter((t) => t.id !== id)],
  });
  return { activeThreadId: id, messages: [], threads: loadAssistantThreadState(endpoint).threads };
}
