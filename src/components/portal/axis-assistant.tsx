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
import { registerPortalAssistant } from "@/lib/general-assistant/open-store";
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

function handleOpenAssistant(portal: AssistantPortal) {
  track("assistant_opened", { portal });
  startTransition(() => {
    openAxisAssistant();
  });
}

/**
 * Generic confirmation card for a proposed write action. Everything rendered
 * here is server-derived preview data; the Confirm button is the only way any
 * assistant action executes.
 */
function PendingActionCard({
  action,
  loading,
  onDecision,
}: {
  action: PendingAction;
  loading: boolean;
  onDecision: (decision: "confirm" | "cancel") => void;
}) {
  const destructive = action.destructive || Boolean(action.preview.warning);
  return (
    <div
      className={cn(
        "mb-3 rounded-2xl border p-3",
        destructive ? "border-danger/30 bg-danger/5" : "border-primary/25 bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">{action.preview.title}</p>
        {action.preview.batchCount && action.preview.batchCount > 1 ? (
          <span className="rounded-full border border-border bg-foreground/5 px-2 py-0.5 text-[10px] font-semibold text-muted">
            {action.preview.batchCount} actions
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">{action.preview.summary}</p>
      {action.preview.lines.length > 0 ? (
        <dl className="mt-2 space-y-1">
          {action.preview.lines.map((line, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 text-xs">
              <dt className="shrink-0 font-medium text-foreground">{line.label}</dt>
              <dd className="truncate text-right text-muted">{line.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {action.preview.warning ? (
        <p className="mt-2 rounded-lg border border-danger/20 bg-danger/5 px-2 py-1.5 text-[11px] leading-relaxed text-danger">
          {action.preview.warning}
        </p>
      ) : null}
      {action.simulated ? (
        <p className="mt-2 text-[11px] italic text-muted">Demo — nothing will actually be sent.</p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => onDecision("confirm")}
          data-attr="assistant-action-confirm"
          className={cn(
            "flex-1 rounded-full px-3 py-2 text-xs font-semibold text-white disabled:opacity-50",
            destructive ? "bg-danger" : "bg-primary",
          )}
        >
          {action.preview.confirmLabel ?? "Confirm"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => onDecision("cancel")}
          data-attr="assistant-action-cancel"
          className="rounded-full border border-border px-3 py-2 text-xs font-semibold text-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Assistant FAB — floats above the bottom nav bar in the native app (clearing it
 * via the same measured `--portal-native-bottom-nav-inset` the bar itself uses),
 * bottom-right on web. Always rendered: the assistant is no longer a bar slot.
 */
function AxisAssistantFixedTrigger({ portal }: { portal: AssistantPortal }) {
  const open = useAxisAssistantOpen();
  if (open) return null;

  return (
    <button
      type="button"
      onClick={() => handleOpenAssistant(portal)}
      aria-label="Open Axis Assistant"
      aria-expanded={open}
      data-attr="axis-assistant-fab"
      className="axis-assistant-fab group fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] z-[55] flex h-12 w-12 items-center justify-center rounded-full text-white shadow-[0_12px_28px_-12px_rgba(47,107,255,0.75)] outline-none transition-[transform,filter] duration-200 hover:scale-105 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-95 lg:bottom-6 lg:right-6 max-lg:bottom-[calc(var(--portal-native-bottom-nav-inset)+0.75rem)] max-lg:h-11 max-lg:w-11 [html[data-native]_&]:bottom-[calc(var(--portal-native-bottom-nav-inset)+0.75rem)] [html[data-native]_&]:h-11 [html[data-native]_&]:w-11"
      style={{ background: "var(--btn-primary)" }}
    >
      <AxisAssistantSparkleIcon className="h-5 w-5 max-lg:h-[18px] max-lg:w-[18px] [html[data-native]_&]:h-[18px] [html[data-native]_&]:w-[18px]" />
    </button>
  );
}

type ChatMessage = { role: "user" | "assistant"; content: string; checkoutUrl?: string };
type ToolTraceEntry = { tool: string; ok: boolean };

/** Wire shape of a proposed write action awaiting user confirmation. */
type PendingAction = {
  id: string;
  toolName: string;
  destructive: boolean;
  expiresAt: string;
  preview: {
    title: string;
    summary: string;
    lines: { label: string; value: string }[];
    confirmLabel?: string;
    warning?: string;
    batchCount?: number;
  };
  simulated?: boolean;
};

type ChatImage = { mediaType: string; dataBase64: string; previewUrl: string };

export type AssistantPortal = "manager" | "resident" | "vendor";

type Suggestion = { label: string; prompt: string; icon: ReactNode; toneClass: string };

const MANAGER_SUGGESTIONS: Suggestion[] = [
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

const RECEIPT_ICON = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 12h.01M3 10h18"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const WRENCH_ICON = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M14.7 6.3a4.5 4.5 0 0 0-6 5.6L3 17.6V21h3.4l5.7-5.7a4.5 4.5 0 0 0 5.6-6l-3 3-2.8-.7-.7-2.8 3-3Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const MESSAGE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CALENDAR_ICON = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const RESIDENT_SUGGESTIONS: Suggestion[] = [
  {
    label: "My balance",
    prompt: "What's my current balance and when is rent due?",
    toneClass: "text-primary",
    icon: RECEIPT_ICON,
  },
  {
    label: "Report a problem",
    prompt: "I need to report a maintenance problem in my home.",
    toneClass: "text-[var(--status-pending-fg)]",
    icon: WRENCH_ICON,
  },
  {
    label: "Message my manager",
    prompt: "I'd like to send a message to my property manager.",
    toneClass: "text-[var(--status-approved-fg)]",
    icon: MESSAGE_ICON,
  },
  {
    label: "My lease",
    prompt: "What's the status of my lease and when does it end?",
    toneClass: "text-[var(--status-overdue-fg)]",
    icon: CALENDAR_ICON,
  },
];

const VENDOR_SUGGESTIONS: Suggestion[] = [
  {
    label: "My jobs",
    prompt: "What jobs am I currently assigned to?",
    toneClass: "text-primary",
    icon: WRENCH_ICON,
  },
  {
    label: "Bid invitations",
    prompt: "Do I have any open bid invitations?",
    toneClass: "text-[var(--status-pending-fg)]",
    icon: RECEIPT_ICON,
  },
  {
    label: "Next visit",
    prompt: "When is my next scheduled visit?",
    toneClass: "text-[var(--status-approved-fg)]",
    icon: CALENDAR_ICON,
  },
  {
    label: "My payouts",
    prompt: "Have I been paid for my completed jobs?",
    toneClass: "text-[var(--status-overdue-fg)]",
    icon: MESSAGE_ICON,
  },
];

type PortalCopy = {
  subtitle: string;
  emptyTitle: string;
  emptyBlurb: string;
  placeholder: string;
  suggestions: Suggestion[];
  chatEndpoint: string;
  /** Whether the paperclip/photo attach button shows (manager: listing photos). */
  allowImages: boolean;
};

const PORTAL_COPY: Record<AssistantPortal, PortalCopy> = {
  manager: {
    subtitle: "Ask about your portfolio in plain language",
    emptyTitle: "What should we look at first?",
    emptyBlurb: "Rent, leases, reminders — grounded in your live portfolio data.",
    placeholder: "Ask about your portfolio…",
    suggestions: MANAGER_SUGGESTIONS,
    chatEndpoint: "/api/agent/chat",
    allowImages: true,
  },
  resident: {
    subtitle: "Ask about your home and tenancy",
    emptyTitle: "How can I help with your home?",
    emptyBlurb: "Rent, your lease, repairs, messages — grounded in your own records.",
    placeholder: "Ask about your rent, lease, or a repair…",
    suggestions: RESIDENT_SUGGESTIONS,
    chatEndpoint: "/api/agent/resident-chat",
    allowImages: false,
  },
  vendor: {
    subtitle: "Ask about your jobs and payouts",
    emptyTitle: "What do you want to check?",
    emptyBlurb: "Jobs, bids, visits, payouts — grounded in your own work records.",
    placeholder: "Ask about your jobs, bids, or payouts…",
    suggestions: VENDOR_SUGGESTIONS,
    chatEndpoint: "/api/agent/vendor-chat",
    allowImages: false,
  },
};

const MAX_ATTACHED_IMAGES = 3;

/** Downscale + JPEG-encode an image client-side so requests stay small. */
async function imageToChatAttachment(file: File): Promise<ChatImage | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 1568;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return null;
    ctx2d.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    const dataBase64 = dataUrl.split(",")[1] ?? "";
    if (!dataBase64) return null;
    return { mediaType: "image/jpeg", dataBase64, previewUrl: dataUrl };
  } catch {
    return null;
  }
}

const MemoizedLayoutSlot = memo(function MemoizedLayoutSlot({ children }: { children: ReactNode }) {
  return children;
});

/**
 * Panel + FAB live outside the portal layout tree so opening the assistant does not
 * re-render dashboard/sidebar content (keeps INP under budget).
 */
function AxisAssistantChrome({
  managerName,
  portal = "manager",
  endpoint,
  actionEndpoint = "/api/agent/action",
}: {
  managerName?: string | null;
  portal?: AssistantPortal;
  endpoint?: string;
  actionEndpoint?: string;
}) {
  const copy = PORTAL_COPY[portal];
  const chatEndpoint = endpoint ?? copy.chatEndpoint;
  const isClient = useIsClient();
  const showNativeChrome = useNativeChrome();
  const open = useAxisAssistantOpen();
  const [panelReady, setPanelReady] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastTools, setLastTools] = useState<ToolTraceEntry[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [attachments, setAttachments] = useState<ChatImage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
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
    const images = attachments;
    setMessages(next);
    setInput("");
    setAttachments([]);
    setLoading(true);
    setLastTools([]);
    setPendingAction(null);
    try {
      const res = await fetch(chatEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // History is text-only; the server ignores extra fields on messages.
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          ...(sessionId ? { sessionId } : {}),
          ...(images.length > 0
            ? { images: images.map((i) => ({ mediaType: i.mediaType, dataBase64: i.dataBase64 })) }
            : {}),
        }),
      });
      const data = (await res.json()) as {
        reply?: string;
        toolTrace?: ToolTraceEntry[];
        pendingAction?: PendingAction;
        sessionId?: string;
        error?: string;
      };
      if (!res.ok || data.error) {
        setError(data.error ?? "Something went wrong.");
      } else {
        // A halted write proposal may carry no text — the card is the reply.
        if (data.reply || !data.pendingAction) {
          setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "" }]);
        }
        setLastTools(data.toolTrace ?? []);
        setPendingAction(data.pendingAction ?? null);
        if (data.sessionId) setSessionId(data.sessionId);
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
    setPendingAction(null);
    setAttachments([]);
    setSessionId(null);
    setError(null);
    setInput("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function resolvePendingAction(decision: "confirm" | "cancel") {
    if (!pendingAction || loading) return;
    // Demo/simulated proposals post back to the chat endpoint for a canned reply.
    const target = pendingAction.simulated ? chatEndpoint : actionEndpoint;
    setError(null);
    setLoading(true);
    try {
      if (decision === "cancel" && pendingAction.simulated) {
        setPendingAction(null);
        return;
      }
      const res = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: pendingAction.id, decision }),
      });
      const data = (await res.json()) as {
        reply?: string;
        toolTrace?: ToolTraceEntry[];
        checkoutUrl?: string;
        error?: string;
      };
      if (!res.ok || data.error) {
        setError(data.error ?? "Could not complete that action.");
        // A 409/410 means the card is stale — clear it.
        if (res.status === 404 || res.status === 409 || res.status === 410) setPendingAction(null);
      } else {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: data.reply ?? "Done.", checkoutUrl: data.checkoutUrl },
        ]);
        setLastTools(data.toolTrace ?? []);
        setPendingAction(null);
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  async function attachImage() {
    if (attachments.length >= MAX_ATTACHED_IMAGES || loading) return;
    try {
      const { Capacitor } = await import("@capacitor/core");
      let file: File | null = null;
      let nativePreview: string | null = null;
      if (Capacitor.isNativePlatform()) {
        const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
        const photo = await Camera.getPhoto({
          quality: 80,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Prompt,
        });
        if (photo.webPath) {
          const blob = await (await fetch(photo.webPath)).blob();
          file = new File([blob], `photo-${Date.now()}.jpeg`, { type: blob.type || "image/jpeg" });
          nativePreview = photo.webPath;
        }
      } else {
        file = await new Promise<File | null>((resolve) => {
          const inputEl = document.createElement("input");
          inputEl.type = "file";
          inputEl.accept = "image/*";
          inputEl.onchange = () => resolve(inputEl.files?.[0] ?? null);
          inputEl.click();
        });
      }
      if (!file) return;
      const attachment = await imageToChatAttachment(file);
      if (nativePreview && attachment) attachment.previewUrl = nativePreview;
      if (!attachment) {
        setError("That image couldn't be read — try a different photo.");
        return;
      }
      setAttachments((prev) => (prev.length >= MAX_ATTACHED_IMAGES ? prev : [...prev, attachment]));
    } catch {
      /* user cancelled the picker */
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
                    {copy.subtitle}
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
                        {copy.emptyTitle}
                      </h3>
                    </div>
                    <p className="max-w-[18rem] text-sm leading-relaxed text-muted">
                      {copy.emptyBlurb}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-center",
                      keyboardOpen && "hidden",
                    )}
                  >
                    {copy.suggestions.map((s) => (
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
                        {m.checkoutUrl ? (
                          <a
                            href={m.checkoutUrl}
                            target="_blank"
                            rel="noreferrer"
                            data-attr="assistant-open-checkout"
                            className="mt-2 flex h-9 items-center justify-center rounded-full bg-primary px-4 text-xs font-semibold text-white transition-[filter] hover:brightness-110"
                          >
                            Open secure checkout
                          </a>
                        ) : null}
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
            {pendingAction ? (
              <PendingActionCard
                action={pendingAction}
                loading={loading}
                onDecision={(d) => void resolvePendingAction(d)}
              />
            ) : null}
            {attachments.length > 0 ? (
              <div className="mb-2 flex items-center gap-2">
                {attachments.map((img, i) => (
                  <span key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local data-URL preview */}
                    <img
                      src={img.previewUrl}
                      alt={`Attached image ${i + 1}`}
                      className="h-12 w-12 rounded-lg border border-border object-cover"
                    />
                    <button
                      type="button"
                      aria-label={`Remove image ${i + 1}`}
                      onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[10px] leading-none text-background"
                    >
                      ×
                    </button>
                  </span>
                ))}
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
                placeholder={copy.placeholder}
                className={cn(
                  "max-h-32 min-h-[2.75rem] w-full resize-none [field-sizing:content] rounded-2xl bg-transparent py-3 pr-12 text-sm text-foreground outline-none placeholder:text-muted/70",
                  copy.allowImages ? "pl-11" : "pl-4",
                )}
              />
              {copy.allowImages ? (
                <button
                  type="button"
                  onClick={() => void attachImage()}
                  disabled={loading || attachments.length >= MAX_ATTACHED_IMAGES}
                  aria-label="Attach a photo"
                  data-attr="assistant-attach-image"
                  className="absolute bottom-2 left-2 flex h-8 w-8 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                    <path
                      d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ) : null}
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
      <AxisAssistantFixedTrigger portal={portal} />
      {isClient && panel ? createPortal(panel, document.body) : null}
    </>
  );
}

/**
 * Axis Assistant panel. Grounded Q&A plus confirm-gated actions: it sends the
 * conversation to the portal's agent endpoint, renders grounded answers and
 * which tools ran, and shows a confirmation card whenever the assistant
 * proposes an action — nothing executes until the user confirms.
 */
export function AxisAssistant({
  managerName,
  portal = "manager",
  endpoint,
  actionEndpoint,
  children,
}: {
  managerName?: string | null;
  /** Which portal this assistant serves; sets endpoint, copy, and suggestions. */
  portal?: AssistantPortal;
  /** Chat backend override (the public demo passes `/api/agent/demo-chat`). */
  endpoint?: string;
  /** Confirm backend override; defaults to `/api/agent/action`. */
  actionEndpoint?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    return () => setAxisAssistantOpen(false);
  }, []);

  // Announce to the site-wide general assistant that a portal-scoped assistant
  // FAB is on screen, so it lifts its own FAB above ours (both are bottom-right).
  useEffect(() => registerPortalAssistant(), []);

  return (
    <AxisAssistantPresenceContext.Provider value={true}>
      <MemoizedLayoutSlot>{children}</MemoizedLayoutSlot>
      <AxisAssistantChrome
        managerName={managerName}
        portal={portal}
        endpoint={endpoint}
        actionEndpoint={actionEndpoint}
      />
    </AxisAssistantPresenceContext.Provider>
  );
}
