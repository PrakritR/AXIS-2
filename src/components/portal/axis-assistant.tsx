"use client";

import { useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };
type ToolTraceEntry = { tool: string; ok: boolean };

/**
 * Floating Axis Assistant panel. Read-only Q&A: it sends the conversation to the
 * agent endpoint and renders grounded answers plus which tools ran. All content
 * is rendered as plain React text (no dangerouslySetInnerHTML), so model and tool
 * output cannot inject markup.
 */
export function AxisAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastTools, setLastTools] = useState<ToolTraceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send() {
    const text = input.trim();
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
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open Axis Assistant"
        className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition hover:opacity-90"
      >
        {open ? "×" : "AI"}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-50 flex h-[28rem] w-[22rem] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Axis Assistant</div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
            {messages.length === 0 && (
              <p className="text-muted-foreground">
                Ask about your portfolio, e.g. &ldquo;Who is late on rent?&rdquo; or &ldquo;How many leases are awaiting signature?&rdquo;
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                <span
                  className={
                    "inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 " +
                    (m.role === "user" ? "bg-foreground text-background" : "bg-muted text-foreground")
                  }
                >
                  {m.content}
                </span>
              </div>
            ))}
            {loading && <p className="text-muted-foreground">Thinking…</p>}
            {error && <p className="text-destructive">{error}</p>}
            {lastTools.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Used: {lastTools.map((t) => t.tool).join(", ")}
              </p>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-center gap-2 border-t border-border p-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-md bg-foreground px-3 py-2 text-sm text-background disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
