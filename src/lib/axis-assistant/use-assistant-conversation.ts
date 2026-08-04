"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  attachmentsToApiPayload,
  revokeAttachmentPreview,
  userMessageContentFromInput,
  type PendingChatAttachment,
} from "@/lib/assistant-chat-attachments.client";
import {
  clearAssistantChatMessages,
  loadAssistantChatMessages,
  saveAssistantChatMessages,
} from "@/lib/axis-assistant/assistant-chat-storage";
import { notifyAgentPendingActionsChanged } from "@/lib/axis-assistant/pending-actions-events";
import { notifyListingAssistantUpdated } from "@/lib/listing-assistant-events";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ToolTraceEntry = { tool: string; ok: boolean };
export type AssistantChatThreadSummary = { id: string; title: string; updatedAt: string };

/** The preview from the server's confirm gate. Its input never reaches the browser. */
export type ActionPreview = {
  kind: string;
  title: string;
  confirmLabel: string;
  fields: { label: string; value: string }[];
  warnings?: string[];
};
export type PendingAction = { id: string; preview: ActionPreview };

type HistoryListResponse = {
  threads?: AssistantChatThreadSummary[];
  nextCursor?: string | null;
  error?: string;
};

type TranscriptResponse = {
  conversation?: {
    id: string;
    messages: ChatMessage[];
    pendingAction?: PendingAction | null;
  };
  error?: string;
};

function isRetryableConfirmStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function threadTitleFromMessages(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  const stripped = firstUser?.content.replace(/^\[Context:[^\]]+\]\s*\n+/i, "").trim() ?? "";
  const line = stripped.split("\n")[0]?.trim() ?? "";
  if (!line) return "New conversation";
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}

function upsertThread(
  threads: AssistantChatThreadSummary[],
  sessionId: string,
  messages: ChatMessage[],
): AssistantChatThreadSummary[] {
  const updatedAt = new Date().toISOString();
  const next = { id: sessionId, title: threadTitleFromMessages(messages), updatedAt };
  return [next, ...threads.filter((thread) => thread.id !== sessionId)].sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  );
}

/**
 * One headless transport for every assistant presentation. Portal-wide popup
 * and dock chats use the authenticated server archive; task-bound modal strips
 * keep their existing isolated local thread and are tagged out of that archive.
 */
export type AssistantConversationOptions = {
  /** Isolates modal threads from the portal-wide archive. */
  storageScope?: string;
};

export function useAssistantConversation(endpoint: string, options: AssistantConversationOptions = {}) {
  const storageScope = options.storageScope?.trim() || undefined;
  const multiThread = !storageScope;
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingChatAttachment[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    storageScope ? loadAssistantChatMessages(endpoint, storageScope) : [],
  );
  const [activeThreadId, setActiveThreadId] = useState("");
  const [threads, setThreads] = useState<AssistantChatThreadSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [nextHistoryCursor, setNextHistoryCursor] = useState<string | null>(null);
  const [lastTools, setLastTools] = useState<ToolTraceEntry[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // An archive read can finish after the user begins a new thread. Never let
  // that late response replace the interaction they just started.
  const hasInteractedWithConversation = useRef(false);

  const fetchThreadList = useCallback(
    async (cursor?: string | null, append = false): Promise<AssistantChatThreadSummary[]> => {
      if (!multiThread) return [];
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const url = new URL(endpoint, window.location.origin);
        if (cursor) url.searchParams.set("cursor", cursor);
        const res = await fetch(url.pathname + url.search, { credentials: "include", cache: "no-store" });
        const data = (await res.json()) as HistoryListResponse;
        if (!res.ok || data.error) throw new Error(data.error ?? "Could not load conversations.");
        const incoming = data.threads ?? [];
        setThreads((current) => {
          if (!append && !hasInteractedWithConversation.current) return incoming;
          const existing = new Map(current.map((thread) => [thread.id, thread]));
          for (const thread of incoming) existing.set(thread.id, thread);
          return [...existing.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        });
        setNextHistoryCursor(data.nextCursor ?? null);
        return incoming;
      } catch (cause) {
        setHistoryError(cause instanceof Error ? cause.message : "Could not load conversations.");
        return [];
      } finally {
        setHistoryLoading(false);
      }
    },
    [endpoint, multiThread],
  );

  const fetchTranscript = useCallback(
    async (threadId: string): Promise<TranscriptResponse["conversation"] | null> => {
      const url = new URL(endpoint, window.location.origin);
      url.searchParams.set("sessionId", threadId);
      const res = await fetch(url.pathname + url.search, { credentials: "include", cache: "no-store" });
      const data = (await res.json()) as TranscriptResponse;
      if (!res.ok || data.error || !data.conversation) {
        throw new Error(data.error ?? "Could not load that conversation.");
      }
      return data.conversation;
    },
    [endpoint],
  );

  // The portal layout mounts this provider even when the assistant stays
  // closed. Delay the private archive read until a user opens the popup, sees
  // a dock, or asks for history; otherwise every portal page view would spend
  // a Supabase request without any assistant interaction.
  const archiveHydrated = useRef(false);
  const archiveLoadInFlight = useRef<Promise<void> | null>(null);
  const hydrateArchive = useCallback(async () => {
    if (!multiThread || archiveHydrated.current) return;
    if (archiveLoadInFlight.current) return archiveLoadInFlight.current;
    const load = (async () => {
      const initialThreads = await fetchThreadList();
      archiveHydrated.current = true;
      if (hasInteractedWithConversation.current || initialThreads.length === 0) return;
      try {
        const conversation = await fetchTranscript(initialThreads[0]!.id);
        if (hasInteractedWithConversation.current || !conversation) return;
        setActiveThreadId(conversation.id);
        setMessages(conversation.messages);
        setPendingAction(conversation.pendingAction ?? null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not restore your latest conversation.");
      }
    })();
    archiveLoadInFlight.current = load;
    try {
      await load;
    } finally {
      archiveLoadInFlight.current = null;
    }
  }, [fetchThreadList, fetchTranscript, multiThread]);

  useEffect(() => {
    if (!multiThread) saveAssistantChatMessages(endpoint, messages, storageScope);
  }, [endpoint, messages, multiThread, storageScope]);

  const send = useCallback(
    async (prompt?: string) => {
      const text = userMessageContentFromInput(prompt ?? input, attachments);
      if (!text || loading) return;
      hasInteractedWithConversation.current = true;
      setError(null);
      let hadPending = false;
      setPendingAction((previous) => {
        hadPending = previous !== null;
        return null;
      });
      const attachmentPayload = attachmentsToApiPayload(attachments);
      const next: ChatMessage[] = [...messages, { role: "user", content: text }];
      setMessages(next);
      setInput("");
      const sentAttachments = attachments;
      setAttachments([]);
      setLoading(true);
      setLastTools([]);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next,
            ...(activeThreadId ? { sessionId: activeThreadId } : {}),
            archive: multiThread,
            ...attachmentPayload,
          }),
        });
        const data = (await res.json()) as {
          reply?: string;
          toolTrace?: ToolTraceEntry[];
          pendingAction?: PendingAction;
          sessionId?: string | null;
          error?: string;
        };
        if (!res.ok || data.error) {
          setError(data.error ?? "Something went wrong.");
          setAttachments(sentAttachments);
        } else {
          const completed = [...next, { role: "assistant" as const, content: data.reply ?? "" }];
          setMessages(completed);
          if (data.sessionId) {
            setActiveThreadId(data.sessionId);
            if (multiThread) setThreads((current) => upsertThread(current, data.sessionId!, completed));
          }
          setLastTools(data.toolTrace ?? []);
          setPendingAction(data.pendingAction ?? null);
          if (data.pendingAction || hadPending) notifyAgentPendingActionsChanged();
        }
      } catch {
        setError("Network error.");
        setAttachments(sentAttachments);
      } finally {
        setLoading(false);
      }
    },
    [activeThreadId, attachments, endpoint, input, loading, messages, multiThread],
  );

  const resolvePendingAction = useCallback(
    async (decision: "confirm" | "deny") => {
      if (!pendingAction || loading) return;
      const confirmedKind = pendingAction.preview.kind;
      const listingIdForRefresh = pendingAction.preview.fields.find((field) => field.label === "Listing id")?.value?.trim();
      setError(null);
      setLoading(true);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(decision === "confirm" ? { confirmActionId: pendingAction.id } : { denyActionId: pendingAction.id }),
        });
        const data = (await res.json()) as { reply?: string; toolTrace?: ToolTraceEntry[]; error?: string };
        if (!res.ok || data.error) {
          setError(data.error ?? "Could not complete that action.");
          if (!isRetryableConfirmStatus(res.status)) setPendingAction(null);
        } else {
          setMessages((current) => [...current, { role: "assistant", content: data.reply ?? "Done." }]);
          setLastTools(data.toolTrace ?? []);
          setPendingAction(null);
          if (decision === "confirm" && confirmedKind === "apply_listing_photos" && listingIdForRefresh) {
            notifyListingAssistantUpdated({ propertyId: listingIdForRefresh, tool: "apply_listing_photos" });
          }
        }
      } catch {
        setError("Network error.");
      } finally {
        setLoading(false);
        notifyAgentPendingActionsChanged();
      }
    },
    [endpoint, loading, pendingAction],
  );

  const reset = useCallback(() => {
    hasInteractedWithConversation.current = true;
    attachments.forEach(revokeAttachmentPreview);
    setActiveThreadId("");
    setMessages([]);
    if (!multiThread) clearAssistantChatMessages(endpoint, storageScope);
    setLastTools([]);
    setPendingAction(null);
    setError(null);
    setInput("");
    setAttachments([]);
    setHistoryOpen(false);
  }, [attachments, endpoint, multiThread, storageScope]);

  const openHistory = useCallback(() => {
    if (!multiThread) return;
    setHistoryOpen(true);
    if (archiveHydrated.current) void fetchThreadList();
    else void hydrateArchive();
  }, [fetchThreadList, hydrateArchive, multiThread]);

  const closeHistory = useCallback(() => setHistoryOpen(false), []);

  const selectThread = useCallback(
    async (threadId: string) => {
      if (!multiThread || loading || threadId === activeThreadId) return;
      hasInteractedWithConversation.current = true;
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const conversation = await fetchTranscript(threadId);
        if (!conversation) return;
        setActiveThreadId(conversation.id);
        setMessages(conversation.messages);
        setPendingAction(conversation.pendingAction ?? null);
        setLastTools([]);
        setError(null);
      } catch (cause) {
        setHistoryError(cause instanceof Error ? cause.message : "Could not load that conversation.");
      } finally {
        setHistoryLoading(false);
      }
    },
    [activeThreadId, fetchTranscript, loading, multiThread],
  );

  const loadMoreHistory = useCallback(() => {
    if (!nextHistoryCursor || historyLoading) return;
    void fetchThreadList(nextHistoryCursor, true);
  }, [fetchThreadList, historyLoading, nextHistoryCursor]);

  return {
    input,
    setInput,
    attachments,
    setAttachments,
    messages,
    threads,
    activeThreadId,
    historyOpen,
    historyLoading,
    historyError,
    hasMoreHistory: Boolean(nextHistoryCursor),
    multiThread,
    lastTools,
    pendingAction,
    loading,
    error,
    setError,
    send,
    resolvePendingAction,
    reset,
    openHistory,
    closeHistory,
    selectThread,
    loadMoreHistory,
    hydrateArchive,
    startNewChat: reset,
  } as const;
}
