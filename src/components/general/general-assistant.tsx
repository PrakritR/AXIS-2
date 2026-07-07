"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

import { track } from "@/lib/analytics/track-client";
import { useIsClient } from "@/hooks/use-is-client";
import { useNativeChrome } from "@/hooks/use-is-native-app";
import {
  closeGeneralAssistant,
  getGeneralAssistantOpen,
  getPortalAssistantPresent,
  openGeneralAssistant,
  subscribeGeneralAssistantOpen,
  subscribePortalAssistantPresence,
} from "@/lib/general-assistant/open-store";
import { cn } from "@/lib/utils";

type ChatMessage = { role: "user" | "assistant"; content: string };
type Suggestion = { label: string; prompt: string };

const SUGGESTIONS: Suggestion[] = [
  { label: "What is Axis?", prompt: "What is Axis and who is it for?" },
  { label: "What can it do?", prompt: "What can Axis do for a property manager?" },
  { label: "How much is it?", prompt: "How does Axis pricing work?" },
  { label: "How do I start?", prompt: "How do I get started with Axis?" },
];

function useGeneralOpen() {
  return useSyncExternalStore(subscribeGeneralAssistantOpen, getGeneralAssistantOpen, () => false);
}

function usePortalAssistantPresent() {
  return useSyncExternalStore(subscribePortalAssistantPresence, getPortalAssistantPresent, () => false);
}

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M12 3c5 0 9 3.4 9 7.6 0 4.2-4 7.6-9 7.6-1 0-2-.14-2.9-.4L4 20l1.1-3.3C3.8 15.4 3 13.1 3 10.6 3 6.4 7 3 12 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8.5 10.6h7M8.5 13.4h4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function handleOpen() {
  track("general_assistant_opened");
  openGeneralAssistant();
}

/**
 * Site-wide general AI assistant. A larger FAB pinned bottom-right on
 * public / marketing pages (home, pricing, create-account, /demo). It is
 * intentionally NOT rendered inside the manager, admin, resident, or vendor
 * portals — those surfaces keep their own portal-scoped Axis Assistant, so
 * only one AI button ever shows there. Answers broad questions about Axis via
 * the tool-free `/api/agent/general-chat` endpoint.
 */
const PORTAL_PATH_PREFIXES = ["/portal", "/admin", "/resident", "/vendor"];

export function GeneralAssistant() {
  const isClient = useIsClient();
  const showNativeChrome = useNativeChrome();
  const open = useGeneralOpen();
  const portalPresent = usePortalAssistantPresent();
  const pathname = usePathname();

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeGeneralAssistant();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
      try {
        const res = await fetch("/api/agent/general-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next }),
        });
        const data = (await res.json()) as { reply?: string; error?: string };
        if (!res.ok || data.error) {
          setError(data.error ?? "Something went wrong.");
        } else {
          setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "" }]);
        }
      } catch {
        setError("Network error.");
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages],
  );

  function resetConversation() {
    setMessages([]);
    setError(null);
    setInput("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  // Native app uses the in-portal assistant + bottom nav; keep the web-only
  // general FAB out of the native chrome entirely.
  if (showNativeChrome) return null;

  // Portal surfaces (manager, admin, resident) have their own Axis Assistant —
  // the captain wants only that one there, so the general FAB stays on
  // public / marketing pages only.
  const inPortal = PORTAL_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname?.startsWith(`${prefix}/`),
  );
  if (inPortal) return null;

  // Browse page has its own housing-search filter chat FAB.
  if (pathname === "/rent/browse" || pathname?.startsWith("/rent/browse/")) return null;

  const trigger =
    open ? null : (
      <button
        type="button"
        onClick={handleOpen}
        data-attr="general-assistant-open"
        aria-label="Open Axis AI assistant"
        aria-expanded={open}
        className={cn(
          "group fixed right-[max(1.25rem,env(safe-area-inset-right))] z-[60] inline-flex items-center gap-2 rounded-full pl-4 pr-5 py-3.5 text-white shadow-[0_16px_36px_-14px_rgba(47,107,255,0.8)] outline-none transition-[transform,filter,bottom] duration-200 hover:scale-[1.03] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-95",
          // Lift above the portal Axis Assistant FAB (bottom-6) when present so
          // the two never overlap on the same corner.
          portalPresent
            ? "bottom-[max(5.25rem,calc(env(safe-area-inset-bottom)+4rem))] lg:bottom-24"
            : "bottom-[max(1.25rem,env(safe-area-inset-bottom))] lg:bottom-6",
        )}
        style={{ background: "var(--btn-primary)" }}
      >
        <ChatBubbleIcon className="h-6 w-6 shrink-0" />
        <span className="text-sm font-semibold tracking-[-0.01em]">Ask Axis AI</span>
      </button>
    );

  const panel = open ? (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        aria-label="Close Axis AI assistant"
        className="fixed inset-0 bg-foreground/10 backdrop-blur-[2px]"
        onClick={closeGeneralAssistant}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="general-assistant-title"
        className="glass-card fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] z-[71] flex h-[min(40rem,calc(100dvh-3rem))] w-[min(28rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-primary/15 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.5)] backdrop-blur-xl lg:bottom-6 lg:right-6"
      >
        {/* Header */}
        <div className="relative shrink-0 overflow-hidden border-b border-border/70 px-4 py-3.5">
          <div
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_12%,transparent),transparent_55%)]"
            aria-hidden
          />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <ChatBubbleIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p id="general-assistant-title" className="truncate text-sm font-semibold tracking-[-0.01em] text-foreground">
                  Axis AI
                </p>
                <p className="truncate text-xs text-muted">Ask anything about Axis</p>
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
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={closeGeneralAssistant}
                aria-label="Close Axis AI assistant"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
          {!hasConversation ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
              <div className="flex flex-col gap-1">
                <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">
                  How can I help?
                </h3>
                <p className="max-w-[20rem] text-sm leading-relaxed text-muted">
                  Ask about Axis — features, pricing, the live demo, or how to get started.
                </p>
              </div>
              <div className="grid w-full grid-cols-2 gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => void send(s.prompt)}
                    disabled={loading}
                    data-attr="general-assistant-suggestion"
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-foreground/[0.04] px-3 text-xs font-medium text-foreground outline-none transition-[border-color,background-color,transform] hover:border-primary/25 hover:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-primary/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
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
                <div className="flex w-fit items-center gap-2 rounded-2xl border border-border/70 bg-foreground/[0.03] px-3 py-2 text-muted">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70" />
                  <span className="text-xs">Thinking…</span>
                </div>
              )}
              {error && <p className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
            </div>
          )}
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="shrink-0 border-t border-border/60 bg-background/60 px-3 pb-3 pt-3 backdrop-blur-sm"
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
              placeholder="Ask about Axis…"
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
  ) : null;

  const overlay: ReactNode = (
    <>
      {trigger}
      {panel}
    </>
  );

  return isClient ? createPortal(overlay, document.body) : null;
}
