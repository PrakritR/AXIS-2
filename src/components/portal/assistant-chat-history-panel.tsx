"use client";

import type { AssistantChatThreadSummary } from "@/lib/axis-assistant/assistant-chat-threads";
import { cn } from "@/lib/utils";

function formatThreadWhen(updatedAt: number): string {
  const d = new Date(updatedAt);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AssistantChatHistoryPanel({
  open,
  threads,
  activeThreadId,
  onSelect,
  onNewChat,
  onClose,
  className,
}: {
  open: boolean;
  threads: AssistantChatThreadSummary[];
  activeThreadId: string;
  onSelect: (threadId: string) => void;
  onNewChat: () => void;
  onClose: () => void;
  className?: string;
}) {
  if (!open) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 z-10 flex flex-col bg-card/98 backdrop-blur-sm",
        className,
      )}
      role="dialog"
      aria-label="Past conversations"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-3 py-2.5">
        <p className="text-sm font-semibold text-foreground">Past conversations</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onNewChat}
            className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            New chat
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close conversation history"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-foreground/5 hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {threads.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted">No past conversations yet.</li>
        ) : (
          threads.map((t) => {
            const active = t.id === activeThreadId;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(t.id);
                    onClose();
                  }}
                  className={cn(
                    "mb-1 flex w-full flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left outline-none transition-colors",
                    active
                      ? "bg-primary/10 ring-1 ring-primary/25"
                      : "hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-primary/20",
                  )}
                >
                  <span className="line-clamp-2 w-full text-sm font-medium text-foreground">{t.title}</span>
                  <span className="text-[11px] text-muted">{formatThreadWhen(t.updatedAt)}</span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

/** Header icon buttons for history + new chat (main assistant surfaces). */
export function AssistantChatHistoryControls({
  onOpenHistory,
  onNewChat,
  showNewChat,
  className,
}: {
  onOpenHistory: () => void;
  onNewChat: () => void;
  /** When false, new chat is only in the history panel. */
  showNewChat?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      <button
        type="button"
        onClick={onOpenHistory}
        aria-label="Past conversations"
        title="Past conversations"
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
          <path
            d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {showNewChat ? (
        <button
          type="button"
          onClick={onNewChat}
          aria-label="Start a new conversation"
          title="New chat"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
