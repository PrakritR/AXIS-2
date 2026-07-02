"use client";

import {
  createContext,
  memo,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { track } from "@/lib/analytics/track-client";
import { AxisLogoMark } from "@/components/brand/axis-logo";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useIsClient } from "@/hooks/use-is-client";
import { useNativeChrome } from "@/hooks/use-is-native-app";
import { useVisualViewportBottomInset } from "@/hooks/use-visual-viewport-bottom-inset";
import {
  closeAxisAssistant,
  getAxisAssistantOpen,
  openAxisAssistant,
  setAxisAssistantOpen,
  subscribeAxisAssistantOpen,
  subscribeAxisAssistantPrompt,
} from "@/lib/axis-assistant/open-store";
import { lockPortalScroll } from "@/lib/native/lock-portal-scroll";
import { cn } from "@/lib/utils";

const AxisAssistantPresenceContext = createContext(false);

/** True when the layout wraps children in {@link AxisAssistant}. */
export function useHasAxisAssistant() {
  return useContext(AxisAssistantPresenceContext);
}

function useAxisAssistantOpen() {
  return useSyncExternalStore(subscribeAxisAssistantOpen, getAxisAssistantOpen, () => false);
}

function AxisAssistantSparkleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3ZM18 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function handleOpenAssistant() {
  track("assistant_opened");
  startTransition(() => {
    openAxisAssistant();
  });
}

/** Pinned assistant trigger for the native bottom nav (right slot). */
export function AxisAssistantNavButton() {
  const open = useAxisAssistantOpen();

  return (
    <button
      type="button"
      onClick={handleOpenAssistant}
      aria-label="Open Axis Assistant"
      aria-expanded={open}
      className="axis-assistant-nav-btn group flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-[0_8px_20px_-10px_rgba(47,107,255,0.7)] outline-none transition-[transform,filter] duration-200 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-95"
      style={{ background: "var(--btn-primary)" }}
    >
      <AxisAssistantSparkleIcon className="h-4 w-4" />
    </button>
  );
}

function AxisAssistantFixedTrigger() {
  const open = useAxisAssistantOpen();
  const showNativeChrome = useNativeChrome();
  if (showNativeChrome || open) return null;

  return (
    <button
      type="button"
      onClick={handleOpenAssistant}
      aria-label="Open Axis Assistant"
      aria-expanded={open}
      className="axis-assistant-fab group fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-[max(1.25rem,env(safe-area-inset-left))] z-[55] flex h-12 w-12 items-center justify-center rounded-full text-white shadow-[0_12px_28px_-12px_rgba(47,107,255,0.75)] outline-none transition-[transform,filter] duration-200 hover:scale-105 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-95 lg:bottom-6 lg:left-6"
      style={{ background: "var(--btn-primary)" }}
    >
      <AxisAssistantSparkleIcon className="h-5 w-5" />
    </button>
  );
}

type ChatMessage = { role: "user" | "assistant"; content: string };
type ToolTraceEntry = { tool: string; ok: boolean };
type PendingConfirm = {
  type: "send_rent_reminder";
  chargeId: string;
  residentName: string;
  chargeTitle: string;
  balanceDue?: string;
};

type Suggestion = { label: string; prompt: string; icon: ReactNode; toneClass: string };

const SUGGESTIONS: Suggestion[] = [
  {
    label: "Late on rent",
    prompt: "Who is late on rent right now?",
    toneClass: "text-[var(--status-overdue-fg)]",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 8v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.42 0Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: "Leases to sign",
    prompt: "How many leases are awaiting signature?",
    toneClass: "text-primary",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: "Overdue balance",
    prompt: "What's the total overdue balance across my portfolio?",
    toneClass: "text-[var(--status-pending-fg)]",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 12h.01M3 10h18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: "Draft a reminder",
    prompt: "Draft a rent reminder message for tenants who are overdue.",
    toneClass: "text-[var(--status-approved-fg)]",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

const MemoizedLayoutSlot = memo(function MemoizedLayoutSlot({ children }: { children: ReactNode }) {
  return children;
});

/**
 * Panel + FAB live outside the portal layout tree so opening the assistant does not
 * re-render dashboard/sidebar content (keeps INP under budget).
 */
function AxisAssistantChrome({ managerName, endpoint = "/api/agent/chat" }: { managerName?: string | null; endpoint?: string }) {
  const isClient = useIsClient();
  const showNativeChrome = useNativeChrome();
  const open = useAxisAssistantOpen();
  const [panelReady, setPanelReady] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastTools, setLastTools] = useState<ToolTraceEntry[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const keyboardInset = useVisualViewportBottomInset(open && panelReady);
  useFocusTrap(open && panelReady, panelRef);

  const firstName = managerName?.trim().split(/\s+/)[0] || null;
  const hasConversation = messages.length > 0;
  const keyboardOpen = keyboardInset > 0;

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset panel readiness when closed
      setPanelReady(false);
      return;
    }
    const frame = requestAnimationFrame(() => {
      setPanelReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  useEffect(() => {
    if (!open || !panelReady || showNativeChrome) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, panelReady, showNativeChrome]);

  useEffect(() => {
    if (!open) {
      document.documentElement.removeAttribute("data-axis-assistant-open");
      return;
    }
    document.documentElement.setAttribute("data-axis-assistant-open", "");
    return () => document.documentElement.removeAttribute("data-axis-assistant-open");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAxisAssistant();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return lockPortalScroll();
  }, [open]);

  const closePanel = useCallback(() => {
    closeAxisAssistant();
  }, []);

  // Scripted prompts (the /demo "Run demo" auto-play) submit through here.
  const sendRef = useRef<(prompt?: string) => void>(() => {});
  useEffect(() => {
    return subscribeAxisAssistantPrompt((prompt) => {
      // Defer so the panel is mounted/open before the first scripted send.
      requestAnimationFrame(() => sendRef.current(prompt));
    });
  }, []);

  async function send(prompt?: string) {
    const text = (prompt ?? input).trim();
    if (!text || loading) return;
    setError(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setLastTools([]);
    setPendingConfirm(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await res.json()) as {
        reply?: string;
        toolTrace?: ToolTraceEntry[];
        pendingConfirm?: PendingConfirm;
        error?: string;
      };
      if (!res.ok || data.error) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "" }]);
        setLastTools(data.toolTrace ?? []);
        setPendingConfirm(data.pendingConfirm ?? null);
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  function resetConversation() {
    setMessages([]);
    setLastTools([]);
    setPendingConfirm(null);
    setError(null);
    setInput("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function confirmPendingAction() {
    if (!pendingConfirm || loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmAction: { type: pendingConfirm.type, chargeId: pendingConfirm.chargeId },
        }),
      });
      const data = (await res.json()) as { reply?: string; toolTrace?: ToolTraceEntry[]; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Could not complete that action.");
      } else {
        setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "Done." }]);
        setLastTools(data.toolTrace ?? []);
        setPendingConfirm(null);
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  // Keep the scripted-prompt sender pointing at the latest closure (updated
  // after each render so it captures current messages/loading state).
  useEffect(() => {
    sendRef.current = (prompt?: string) => void send(prompt);
  });

  const hideEmptyChrome = showNativeChrome && keyboardOpen && !hasConversation;

  const panelStyle: CSSProperties | undefined = showNativeChrome
    ? keyboardOpen
      ? {
          bottom: `${keyboardInset + 8}px`,
          maxHeight: `calc(100dvh - var(--native-safe-top, 0px) - ${keyboardInset}px - 0.75rem)`,
        }
      : undefined
    : keyboardOpen
      ? {
          transform: `translateY(-${keyboardInset}px)`,
          maxHeight: `calc(100dvh - var(--native-safe-top, 0px) - var(--native-safe-bottom, 0px) - 5rem - ${keyboardInset}px)`,
        }
      : undefined;

  const panel =
    open && panelReady ? (
      <div className="axis-assistant-root fixed inset-0 z-[65]">
        <button
          type="button"
          aria-label="Close Axis Assistant"
          className="axis-assistant-backdrop fixed inset-0"
          onClick={closePanel}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="axis-assistant-title"
          className={cn(
            "axis-assistant-panel glass-card fixed z-[66] flex h-[min(38rem,calc(100dvh-7.5rem))] flex-col overflow-hidden border border-primary/15 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.45),0_0_0_1px_rgba(47,107,255,0.08)] backdrop-blur-xl",
            keyboardOpen && "axis-assistant-panel--keyboard",
          )}
          style={panelStyle}
        >
          <div className="relative shrink-0 overflow-hidden border-b border-border/70 px-4 py-3.5 [html[data-native]_&]:py-2.5">
            <div
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_55%)]"
              aria-hidden
            />
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                  <AxisAssistantSparkleIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p id="axis-assistant-title" className="truncate text-sm font-semibold tracking-[-0.01em] text-foreground">
                    Axis Assistant
                  </p>
                  <p className="truncate text-xs text-muted [html[data-native]_&]:hidden">
                    Ask about your portfolio in plain language
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {hasConversation && (
                  <button
                    type="button"
                    onClick={resetConversation}
                    aria-label="Start a new conversation"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                      <path
                        d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={closePanel}
                  aria-label="Close Axis Assistant"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {hideEmptyChrome ? null : (
            <div
              ref={scrollRef}
              className={cn(
                "flex flex-col overflow-y-auto px-4 py-4 [html[data-native]_&]:py-2",
                hasConversation ? "min-h-0 flex-1" : "min-h-0 flex-1 [html[data-native]_&]:flex-none",
              )}
            >
              {!hasConversation ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center [html[data-native]_&]:flex-none [html[data-native]_&]:justify-start [html[data-native]_&]:gap-2.5 [html[data-native]_&]:pt-0">
                  <AxisLogoMark className="[html[data-native]_&]:hidden" />
                  <div className="hidden flex-col gap-1 [html[data-native]_&]:flex">
                    <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                      {firstName ? `Hi ${firstName} — what should we look at?` : "What should we look at?"}
                    </h3>
                  </div>
                  <div className="flex flex-col gap-1.5 [html[data-native]_&]:hidden">
                    <div className="flex flex-col">
                      {firstName && (
                        <h2 className="text-lg font-medium tracking-tight text-muted">Hi {firstName},</h2>
                      )}
                      <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">
                        What should we look at first?
                      </h3>
                    </div>
                    <p className="max-w-[18rem] text-sm leading-relaxed text-muted">
                      Rent, leases, reminders — grounded in your live portfolio data.
                    </p>
                  </div>
                  <div
                    className={cn(
                      "grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-center",
                      keyboardOpen && "hidden",
                    )}
                  >
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => void send(s.prompt)}
                        disabled={loading}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-foreground/[0.04] px-3 text-xs font-medium text-foreground outline-none transition-[border-color,background-color,transform] hover:border-primary/25 hover:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-primary/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-full"
                      >
                        <span className={`flex h-3.5 w-3.5 shrink-0 ${s.toneClass} [&_svg]:h-full [&_svg]:w-full`}>
                          {s.icon}
                        </span>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  {messages.map((m, i) => (
                    <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                      <span
                        className={
                          "inline-block max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-left " +
                          (m.role === "user"
                            ? "rounded-br-md text-white shadow-[0_8px_20px_-12px_rgba(47,107,255,0.6)]"
                            : "rounded-bl-md border border-border bg-foreground/[0.04] text-foreground")
                        }
                        style={m.role === "user" ? { background: "var(--btn-primary)" } : undefined}
                      >
                        {m.content}
                      </span>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-foreground/[0.03] px-3 py-2 text-muted w-fit">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70" />
                      <span className="text-xs">Thinking…</span>
                    </div>
                  )}
                  {error && <p className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
                  {lastTools.length > 0 && (
                    <p className="text-xs text-muted">Used: {lastTools.map((t) => t.tool).join(", ")}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="shrink-0 border-t border-border/60 bg-background/60 px-3 pb-3 pt-3 backdrop-blur-sm [html[data-native]_&]:pb-[max(0.75rem,var(--native-safe-bottom))]"
          >
            {pendingConfirm ? (
              <div className="mb-3 rounded-2xl border border-primary/25 bg-primary/5 p-3">
                <p className="text-xs font-semibold text-foreground">Confirm action</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Send a payment reminder to {pendingConfirm.residentName} for {pendingConfirm.chargeTitle}
                  {pendingConfirm.balanceDue ? ` (${pendingConfirm.balanceDue})` : ""}?
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void confirmPendingAction()}
                    className="flex-1 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Send reminder
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setPendingConfirm(null)}
                    className="rounded-full border border-border px-3 py-2 text-xs font-semibold text-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
            <div className="relative rounded-2xl border border-border bg-auth-input-bg shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,box-shadow] duration-200 focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder="Ask about your portfolio…"
                className="max-h-32 min-h-[2.75rem] w-full resize-none [field-sizing:content] rounded-2xl bg-transparent py-3 pl-4 pr-12 text-sm text-foreground outline-none placeholder:text-muted/70"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send message"
                className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full text-white outline-none transition-[filter,opacity,transform] duration-200 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: "var(--btn-primary)" }}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                  <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      </div>
    ) : open ? (
      <div className="axis-assistant-root fixed inset-0 z-[65]">
        <button
          type="button"
          aria-label="Close Axis Assistant"
          className="axis-assistant-backdrop fixed inset-0"
          onClick={closePanel}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-busy="true"
          aria-label="Opening Axis Assistant"
          className="axis-assistant-panel glass-card fixed z-[66] flex h-[min(38rem,calc(100dvh-7.5rem))] flex-col overflow-hidden border border-primary/15 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.45),0_0_0_1px_rgba(47,107,255,0.08)] backdrop-blur-xl"
        />
      </div>
    ) : null;

  return (
    <>
      <AxisAssistantFixedTrigger />
      {isClient && panel ? createPortal(panel, document.body) : null}
    </>
  );
}

/**
 * Axis Assistant panel. Read-only Q&A: it sends the conversation to the
 * agent endpoint and renders grounded answers plus which tools ran.
 */
export function AxisAssistant({
  managerName,
  endpoint,
  children,
}: {
  managerName?: string | null;
  /** Chat backend to target. Defaults to the auth-gated `/api/agent/chat`; the
   * public demo passes the sandboxed `/api/agent/demo-chat`. */
  endpoint?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    return () => setAxisAssistantOpen(false);
  }, []);

  return (
    <AxisAssistantPresenceContext.Provider value={true}>
      <MemoizedLayoutSlot>{children}</MemoizedLayoutSlot>
      <AxisAssistantChrome managerName={managerName} endpoint={endpoint} />
    </AxisAssistantPresenceContext.Provider>
  );
}
