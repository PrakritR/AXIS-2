"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { track } from "@/lib/analytics/track-client";
import { AssistantMarkdown } from "@/components/portal/assistant-markdown";
import {
  closeAxisAssistant,
  getAxisAssistantOpen,
  openAxisAssistant,
  subscribeAxisAssistantOpen,
  subscribeAxisAssistantPrompt,
} from "@/lib/axis-assistant/open-store";
import { cn } from "@/lib/utils";

type ChatMessage = { role: "user" | "assistant"; content: string };
type ToolTraceEntry = { tool: string; ok: boolean };
type Suggestion = { label: string; prompt: string };

// Portal/property-scoped starters — the same kind of questions the real portal
// Axis Assistant answers, grounded in the sandboxed demo portfolio.
const SUGGESTIONS: Suggestion[] = [
  { label: "Late on rent", prompt: "Who is late on rent right now?" },
  { label: "Leases to sign", prompt: "How many leases are awaiting signature?" },
  { label: "Overdue balance", prompt: "What's the total overdue balance across the portfolio?" },
];

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3ZM18 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function useOpen() {
  return useSyncExternalStore(subscribeAxisAssistantOpen, getAxisAssistantOpen, () => false);
}

/**
 * The in-demo Axis Assistant — the portal/property-scoped assistant, pinned
 * bottom-right INSIDE the demo frame exactly where it sits in the real property
 * portal. It talks to the sandboxed `/api/agent/demo-chat` (fictional portfolio
 * data) and is fully CONTAINED within the frame: its FAB, backdrop, and panel
 * are absolutely positioned inside the (overflow-hidden) frame, so nothing spills
 * onto the page. The site-wide general assistant handles broader questions.
 *
 * The "Run demo" auto-play drives this via the shared scripted-prompt channel.
 */
export function DemoFrameAssistant() {
  const open = useOpen();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastTools, setLastTools] = useState<ToolTraceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasConversation = messages.length > 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const send = useCallback(
    async (prompt?: string) => {
      const text = (prompt ?? input).trim();
      if (!text || loading) return;
      setError(null);
      const next: ChatMessage[] = [...messages, { role: "user", content: text }];
      setMessages(next);
      setInput("");
      setLoading(true);
      setLastTools([]);
      try {
        const res = await fetch("/api/agent/demo-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next }),
        });
        const data = (await res.json()) as { reply?: string; toolTrace?: ToolTraceEntry[]; error?: string };
        if (!res.ok || data.error) {
          setError(data.error ?? "Something went wrong.");
        } else {
          setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "" }]);
          setLastTools(data.toolTrace ?? []);
        }
      } catch {
        setError("Network error.");
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages],
  );

  // Scripted prompts from the "Run demo" auto-play arrive on the shared channel.
  const sendRef = useRef<(prompt?: string) => void>(() => {});
  useEffect(() => {
    sendRef.current = (prompt?: string) => void send(prompt);
  });
  useEffect(() => {
    return subscribeAxisAssistantPrompt((prompt) => {
      requestAnimationFrame(() => sendRef.current(prompt));
    });
  }, []);

  function resetConversation() {
    setMessages([]);
    setLastTools([]);
    setError(null);
    setInput("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <>
      {/* FAB — bottom-right of the demo frame, mirroring the real portal */}
      {!open ? (
        <button
          type="button"
          onClick={() => {
            track("assistant_opened", { surface: "demo" });
            openAxisAssistant();
          }}
          data-attr="demo-assistant-open"
          aria-label="Open Axis Assistant"
          aria-expanded={open}
          className="absolute bottom-4 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full text-white shadow-[0_12px_28px_-12px_rgba(47,107,255,0.75)] outline-none transition-[transform,filter] duration-200 hover:scale-105 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-95"
          style={{ background: "var(--btn-primary)" }}
        >
          <SparkleIcon className="h-5 w-5" />
        </button>
      ) : null}

      {/* Panel — contained within the frame */}
      {open ? (
        <div className="absolute inset-0 z-50">
          <button
            type="button"
            aria-label="Close Axis Assistant"
            className="absolute inset-0 bg-foreground/10 backdrop-blur-[1px]"
            onClick={closeAxisAssistant}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-assistant-title"
            className="glass-card absolute bottom-4 right-4 z-[51] flex h-[min(30rem,calc(100%-2rem))] w-[min(22rem,calc(100%-2rem))] flex-col overflow-hidden rounded-2xl border border-primary/15 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.5)] backdrop-blur-xl"
          >
            <div className="relative shrink-0 overflow-hidden border-b border-border/70 px-4 py-3">
              <div
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_55%)]"
                aria-hidden
              />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                    <SparkleIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p id="demo-assistant-title" className="truncate text-sm font-semibold tracking-[-0.01em] text-foreground">
                      Axis Assistant
                    </p>
                    <p className="truncate text-xs text-muted">Grounded in this portfolio</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {hasConversation && (
                    <button
                      type="button"
                      onClick={resetConversation}
                      aria-label="Start a new conversation"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-foreground/5 hover:text-foreground"
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                        <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeAxisAssistant}
                    aria-label="Close Axis Assistant"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-foreground/5 hover:text-foreground"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3.5">
              {!hasConversation ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                      What should we look at first?
                    </h3>
                    <p className="max-w-[16rem] text-xs leading-relaxed text-muted">
                      Rent, leases, reminders — grounded in this demo portfolio.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => void send(s.prompt)}
                        disabled={loading}
                        data-attr="demo-assistant-suggestion"
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-border bg-foreground/[0.04] px-3 text-xs font-medium text-foreground outline-none transition-[border-color,background-color,transform] hover:border-primary/25 hover:bg-foreground/[0.07] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 text-sm">
                  {messages.map((m, i) => (
                    <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                      <span
                        className={cn(
                          "inline-block max-w-[88%] rounded-2xl px-3 py-2 text-left",
                          m.role === "user"
                            ? "whitespace-pre-wrap rounded-br-md text-white shadow-[0_8px_20px_-12px_rgba(47,107,255,0.6)]"
                            : "rounded-bl-md border border-border bg-foreground/[0.04] text-foreground",
                        )}
                        style={m.role === "user" ? { background: "var(--btn-primary)" } : undefined}
                      >
                        {m.role === "user" ? m.content : <AssistantMarkdown text={m.content} />}
                      </span>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex w-fit items-center gap-2 rounded-2xl border border-border/70 bg-foreground/[0.03] px-3 py-2 text-muted">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70" />
                      <span className="text-xs">Thinking…</span>
                    </div>
                  )}
                  {error && <p className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">{error}</p>}
                  {lastTools.length > 0 && (
                    <p className="text-xs text-muted">Used: {lastTools.map((t) => t.tool).join(", ")}</p>
                  )}
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="shrink-0 border-t border-border/60 bg-background/60 px-3 pb-3 pt-3 backdrop-blur-sm"
            >
              <div className="relative rounded-2xl border border-border bg-auth-input-bg transition-[border-color,box-shadow] duration-200 focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10">
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
                  placeholder="Ask about this portfolio…"
                  className="max-h-28 min-h-[2.5rem] w-full resize-none [field-sizing:content] rounded-2xl bg-transparent py-2.5 pl-3.5 pr-11 text-sm text-foreground outline-none placeholder:text-muted/70"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  aria-label="Send message"
                  className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full text-white outline-none transition-[filter,opacity,transform] duration-200 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: "var(--btn-primary)" }}
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                    <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
