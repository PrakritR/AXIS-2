"use client";

import { createContext, useContext, type ReactNode } from "react";

import {
  useAssistantConversation,
  type ChatMessage,
  type PendingAction,
  type ToolTraceEntry,
} from "@/lib/axis-assistant/use-assistant-conversation";

export type AssistantConversationValue = {
  input: string;
  setInput: (value: string) => void;
  attachments: import("@/lib/assistant-chat-attachments.client").PendingChatAttachment[];
  setAttachments: (
    value: import("@/lib/assistant-chat-attachments.client").PendingChatAttachment[],
  ) => void;
  messages: ChatMessage[];
  lastTools: ToolTraceEntry[];
  pendingAction: PendingAction | null;
  loading: boolean;
  error: string | null;
  setError: (message: string | null) => void;
  send: (prompt?: string) => Promise<void>;
  resolvePendingAction: (decision: "confirm" | "deny") => Promise<void>;
  reset: () => void;
};

const AssistantConversationContext = createContext<AssistantConversationValue | null>(null);

/** One conversation shared by the popup and the docked right rail. */
export function AssistantConversationProvider({
  endpoint,
  children,
}: {
  endpoint: string;
  children: ReactNode;
}) {
  const conversation = useAssistantConversation(endpoint);
  return (
    <AssistantConversationContext.Provider value={conversation}>
      {children}
    </AssistantConversationContext.Provider>
  );
}

/** Shared conversation from {@link AssistantConversationProvider} (popup + dock). */
export function useOptionalAssistantConversation(_endpoint?: string): AssistantConversationValue {
  void _endpoint;
  const shared = useContext(AssistantConversationContext);
  if (!shared) {
    throw new Error("useOptionalAssistantConversation requires AssistantConversationProvider");
  }
  return shared;
}
