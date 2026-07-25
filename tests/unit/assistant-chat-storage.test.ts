// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  assistantChatStorageKey,
  clearAssistantChatMessages,
  loadAssistantChatMessages,
  modalAssistantStorageScope,
  saveAssistantChatMessages,
} from "@/lib/axis-assistant/assistant-chat-storage";

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

describe("assistant-chat-storage", () => {
  beforeEach(() => {
    installFakeStorage();
  });

  it("round-trips messages for an endpoint", () => {
    const messages = [
      { role: "user" as const, content: "Hello" },
      { role: "assistant" as const, content: "Hi there" },
    ];
    saveAssistantChatMessages(ENDPOINT, messages);
    expect(loadAssistantChatMessages(ENDPOINT)).toEqual(messages);
    expect(assistantChatStorageKey(ENDPOINT)).toContain(ENDPOINT);
  });

  it("clear removes stored history", () => {
    saveAssistantChatMessages(ENDPOINT, [{ role: "user", content: "x" }]);
    clearAssistantChatMessages(ENDPOINT);
    expect(loadAssistantChatMessages(ENDPOINT)).toEqual([]);
  });

  it("keeps modal-scoped history separate from the main portal thread", () => {
    const modalScope = modalAssistantStorageScope("New promotion", 2);
    saveAssistantChatMessages(ENDPOINT, [{ role: "user", content: "main" }]);
    saveAssistantChatMessages(ENDPOINT, [{ role: "user", content: "promo" }], modalScope);
    expect(loadAssistantChatMessages(ENDPOINT)).toEqual([{ role: "user", content: "main" }]);
    expect(loadAssistantChatMessages(ENDPOINT, modalScope)).toEqual([{ role: "user", content: "promo" }]);
    expect(assistantChatStorageKey(ENDPOINT, modalScope)).toContain("modal:new-promotion:2");
  });
});
