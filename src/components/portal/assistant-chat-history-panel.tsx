"use client";

import { useState } from "react";
import { FilePenLine, Search, Trash2 } from "lucide-react";

import type { AssistantChatThreadSummary } from "@/lib/axis-assistant/use-assistant-conversation";
import { ModalShell } from "@/components/ui/modal";
import { ConfirmDeleteModal } from "@/components/portal/confirm-delete-modal";
import { cn } from "@/lib/utils";

function formatThreadWhen(updatedAt: string): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AssistantChatHistoryPanel({
  open,
  threads,
  activeThreadId,
  onSelect,
  onDelete,
  onNewChat,
  onClose,
  loading = false,
  error = null,
  searchQuery = "",
  hasMore = false,
  onRetry,
  onLoadMore,
  onSearchQueryChange,
  className,
  portalContainer,
}: {
  open: boolean;
  threads: AssistantChatThreadSummary[];
  activeThreadId: string;
  onSelect: (threadId: string) => Promise<void>;
  onDelete: (threadId: string) => Promise<boolean>;
  onNewChat: () => void;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
  searchQuery?: string;
  hasMore?: boolean;
  onRetry?: () => void;
  onLoadMore?: () => void;
  onSearchQueryChange?: (value: string) => void;
  className?: string;
  /** Portal target — keeps the overlay scoped inside its assistant panel. */
  portalContainer?: HTMLElement | null;
}) {
  const [deleteTarget, setDeleteTarget] = useState<AssistantChatThreadSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const deleted = await onDelete(deleteTarget.id);
    setDeleting(false);
    if (deleted) setDeleteTarget(null);
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      presentation="dialog"
      hideOverlay
      lockScroll={false}
      portalContainer={portalContainer}
      stackClassName="absolute inset-0 z-10"
      centerClassName="absolute inset-0 flex"
      panelClassName={cn("flex h-full w-full flex-col bg-card/98 backdrop-blur-sm outline-none", className)}
      ariaLabel="Past conversations"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Past conversations</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close conversation history"
            data-attr="assistant-history-close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <div className="shrink-0 space-y-2 border-b border-border/70 p-2.5">
        <label className="relative block">
          <span className="sr-only">Search conversations</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange?.(event.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            data-attr="assistant-history-search"
            className="h-10 w-full rounded-lg border border-border/80 bg-foreground/[0.025] py-2 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
          />
        </label>
        <button
          type="button"
          onClick={onNewChat}
          data-attr="assistant-history-new-chat"
          className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm font-medium text-foreground outline-none transition-colors hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-primary/25"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/80 bg-card text-muted">
            <FilePenLine className="h-3.5 w-3.5" aria-hidden />
          </span>
          New conversation
        </button>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-2" aria-busy={loading}>
        {loading && threads.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted" aria-live="polite">Loading conversations…</li>
        ) : error ? (
          <li className="space-y-3 px-2 py-6 text-center text-sm text-danger">
            <p>{error}</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                data-attr="assistant-history-retry"
                className="min-h-10 rounded-lg px-3 text-sm font-medium text-foreground outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-primary/25"
              >
                Try again
              </button>
            ) : null}
          </li>
        ) : threads.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted">
            {searchQuery.trim() ? "No conversations match your search." : "No past conversations yet."}
          </li>
        ) : (
          threads.map((thread) => {
            const active = thread.id === activeThreadId;
            return (
              <li
                key={thread.id}
                className={cn(
                  "group mb-1 flex min-h-10 items-stretch rounded-xl outline-none transition-colors",
                  active
                    ? "bg-primary/10 ring-1 ring-primary/25"
                    : "hover:bg-foreground/[0.04] focus-within:ring-2 focus-within:ring-primary/20",
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    void onSelect(thread.id);
                    onClose();
                  }}
                  data-attr="assistant-history-select-thread"
                  className={cn(
                    "flex min-h-10 min-w-0 flex-1 flex-col items-start gap-0.5 rounded-l-xl px-3 py-2.5 text-left outline-none",
                    !active && "focus-visible:ring-2 focus-visible:ring-primary/20",
                  )}
                >
                  <span className="line-clamp-2 w-full text-sm font-medium text-foreground">{thread.title}</span>
                  <span className="text-[11px] text-muted">{formatThreadWhen(thread.updatedAt)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(thread)}
                  aria-label={`Delete ${thread.title}`}
                  title="Delete conversation"
                  data-attr="assistant-history-delete"
                  className="my-1.5 mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-md text-muted/70 outline-none transition hover:bg-danger/10 hover:text-danger focus-visible:ring-2 focus-visible:ring-danger/25"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            );
          })
        )}
      </ul>
      {hasMore ? (
        <div className="shrink-0 border-t border-border/70 p-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            data-attr="assistant-history-load-more"
            className="min-h-10 w-full rounded-lg px-3 text-sm font-medium text-foreground outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Loading…" : "Load older conversations"}
          </button>
        </div>
      ) : null}
      <ConfirmDeleteModal
        open={deleteTarget !== null}
        title="Delete conversation?"
        description="This removes the conversation from your history and cancels any unconfirmed draft action in it."
        confirmLabel="Delete conversation"
        busy={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        dataAttr="assistant-history-delete-confirm"
      />
    </ModalShell>
  );
}

/** Header icon buttons for history + new chat on the portal-wide assistant. */
export function AssistantChatHistoryControls({
  onOpenHistory,
  onNewChat,
  showNewChat,
  className,
}: {
  onOpenHistory: () => void;
  onNewChat: () => void;
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
        data-attr="assistant-history-open"
        className="flex h-10 w-10 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {showNewChat ? (
        <button
          type="button"
          onClick={onNewChat}
          aria-label="Start a new conversation"
          title="New chat"
          data-attr="assistant-history-new-chat"
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
