// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  loadAssistantThreadState,
  migrateLegacyAssistantChatToThreads,
  persistAssistantThreadMessages,
  startNewAssistantThread,
  switchAssistantThread,
} from "@/lib/axis-assistant/assistant-chat-threads";
import { saveAssistantChatMessages } from "@/lib/axis-assistant/assistant-chat-storage";

const ENDPOINT = "/api/agent/chat";

function installFakeStorage() {
  const store = new Map<string, string>();
  const fake = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, "localStorage", { value: fake, configurable: true });
}

describe("assistant-chat-threads", () => {
  beforeEach(() => {
    installFakeStorage();
  });

  it("migrates legacy single-thread storage into the thread index", () => {
    saveAssistantChatMessages(ENDPOINT, [{ role: "user", content: "Who is late on rent?" }]);
    migrateLegacyAssistantChatToThreads(ENDPOINT);
    const state = loadAssistantThreadState(ENDPOINT);
    expect(state.messages).toHaveLength(1);
    expect(state.threads[0]?.title).toContain("late on rent");
  });

  it("archives the current thread when starting a new chat", () => {
    const initial = loadAssistantThreadState(ENDPOINT);
    persistAssistantThreadMessages(ENDPOINT, initial.activeThreadId, [
      { role: "user", content: "First chat" },
      { role: "assistant", content: "Hello" },
    ]);
    const next = startNewAssistantThread(ENDPOINT, initial.activeThreadId, [
      { role: "user", content: "First chat" },
      { role: "assistant", content: "Hello" },
    ]);
    expect(next.messages).toEqual([]);
    expect(next.threads.length).toBeGreaterThanOrEqual(2);
    const restored = switchAssistantThread(ENDPOINT, initial.activeThreadId);
    expect(restored.messages.some((m) => m.content === "First chat")).toBe(true);
  });
});
