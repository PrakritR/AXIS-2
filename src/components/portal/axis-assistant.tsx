"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { AxisLogoMark } from "@/components/brand/axis-logo";

type ChatMessage = { role: "user" | "assistant"; content: string };
type ToolTraceEntry = { tool: string; ok: boolean };

type Suggestion = { label: string; prompt: string; icon: ReactNode; toneClass: string };

/**
 * Suggested prompts. Each maps to a real, tool-grounded capability of the agent
 * (`get_overdue_charges`, `list_leases`, `send_rent_reminder`) so we never
 * advertise data the tool layer cannot return.
 */
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

/**
 * Floating Axis Assistant panel. Read-only Q&A: it sends the conversation to the
 * agent endpoint and renders grounded answers plus which tools ran. All content
 * is rendered as plain React text (no dangerouslySetInnerHTML), so model and tool
 * output cannot inject markup.
 */
export function AxisAssistant({ managerName }: { managerName?: string | null }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastTools, setLastTools] = useState<ToolTraceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const firstName = managerName?.trim().split(/\s+/)[0] || null;
  const hasConversation = messages.length > 0;

  // Keep the transcript pinned to the bottom as messages arrive and while the
  // typing indicator is visible.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  // Focus the composer whenever the panel opens.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  async function send(prompt?: string) {
    const text = (prompt ?? input).trim();
    if (!text || loading) return;
    setError(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setLastTools([]);
    try {
      const res = await fetch("/api/agent/chat", {
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
  }

  function resetConversation() {
    setMessages([]);
    setLastTools([]);
    setError(null);
    setInput("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Axis Assistant" : "Open Axis Assistant"}
        className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-[0_10px_24px_-10px_rgba(47,107,255,0.7)] outline-none ring-primary/0 transition-[transform,box-shadow,filter] duration-200 ease-out hover:brightness-110 focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-95"
        style={{ background: "var(--btn-primary)" }}
      >
        {open ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
            <path
              d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3ZM18 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z"
              fill="currentColor"
            />
          </svg>
        )}
      </button>

      {open && (
        <div className="glass-card fixed bottom-20 right-5 z-50 flex h-[34rem] max-h-[calc(100vh-7rem)] w-[23rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-[20px] shadow-[var(--shadow-card)] backdrop-blur-xl">
          <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_18%,transparent)]" />
              <span className="text-sm font-semibold tracking-[-0.01em] text-foreground">Axis Assistant</span>
            </div>
            <div className="flex items-center gap-1">
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
                onClick={() => setOpen(false)}
                aria-label="Close Axis Assistant"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
            {!hasConversation ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
                <AxisLogoMark />
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-col">
                    {firstName && (
                      <h2 className="text-lg font-medium tracking-tight text-muted">Hi {firstName},</h2>
                    )}
                    <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">
                      Welcome back! How can I help?
                    </h3>
                  </div>
                  <p className="text-sm leading-relaxed text-muted">
                    Ask about your portfolio in plain language, or start with one of these.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => void send(s.prompt)}
                      disabled={loading}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-foreground/[0.04] px-3 text-xs font-medium text-foreground outline-none transition-colors hover:border-primary/25 hover:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
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
                        "inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-left " +
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
                  <div className="flex items-center gap-1.5 text-muted">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
                  </div>
                )}
                {error && <p className="text-danger">{error}</p>}
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
            className="shrink-0 px-3 pb-3"
          >
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
                className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full text-white outline-none transition-[filter,opacity] duration-200 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: "var(--btn-primary)" }}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                  <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
