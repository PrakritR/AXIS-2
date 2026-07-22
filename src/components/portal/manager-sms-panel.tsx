"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronLeft, Search, Trash2 } from "lucide-react";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerSmsComposeModal } from "@/components/portal/manager-sms-compose-modal";
import {
  MANAGER_SMS_SORT_OPTIONS,
  normalizeManagerSmsConversationsPayload,
  sortSmsConversationRows,
  smsThreadHasUnread,
  type ManagerSmsConversationsPayload,
  type ManagerSmsMessageRow,
  type ManagerSmsResidentConversation,
  type ManagerSmsSortId,
} from "@/lib/manager-sms-messages";
import {
  threadPassesCommunicationFilters,
  type CommunicationThreadFilters,
} from "@/lib/communication-thread-filters";
import type { InboxScopedContact } from "@/data/inbox-scoped-directory";
import { formatPacificDate } from "@/lib/pacific-time";
import { isNativeRuntimeSync } from "@/lib/native/detect-native";

const SMS_OPENED_STORAGE_KEY = "axis_manager_sms_opened_v1";
const SMS_HIDDEN_STORAGE_KEY = "axis_manager_sms_hidden_v1";

/** iOS Messages blue (outbound bubbles / accents). */
const IOS_BLUE = "#0A84FF";
const IOS_DELETE = "#FF3B30";
const IOS_GRAY_BUBBLE = "rgba(120, 120, 128, 0.36)";
const IOS_LIST_BG = "#1C1C1E";
const IOS_THREAD_BG = "#000000";
const IOS_HAIRLINE = "rgba(84, 84, 88, 0.65)";

function formatPhoneDisplay(phone: string | null): string {
  if (!phone?.trim()) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function conversationId(resident: ManagerSmsResidentConversation): string {
  // The explicit conversation key separates two people on one shared line and
  // the same person across roles — prefer it over the phone so those threads
  // never collapse into one row.
  return (
    resident.conversationKey ??
    resident.phone ??
    resident.residentUserId ??
    resident.residentEmail ??
    resident.name
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

/** iOS Messages list timestamp: time today, weekday this week, else short date. */
function iosListTimestamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((startOfToday.getTime() - startOfMsg.getTime()) / 86_400_000);
  if (dayDiff === 0) {
    return formatPacificDate(d, { hour: "numeric", minute: "2-digit" });
  }
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff > 1 && dayDiff < 7) {
    return formatPacificDate(d, { weekday: "short" });
  }
  return formatPacificDate(d, { month: "numeric", day: "numeric", year: "2-digit" });
}

function loadOpenedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SMS_OPENED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0));
  } catch {
    return new Set();
  }
}

function persistOpenedIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SMS_OPENED_STORAGE_KEY, JSON.stringify([...ids]));
}

function loadHiddenPhones(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SMS_HIDDEN_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0));
  } catch {
    return new Set();
  }
}

function persistHiddenPhones(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SMS_HIDDEN_STORAGE_KEY, JSON.stringify([...ids]));
}

function Avatar({ name }: { name: string }) {
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold text-white"
      style={{
        background: "linear-gradient(180deg, #5e5ce6 0%, #bf5af2 100%)",
      }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

export type ManagerSmsPanelHandle = {
  openCompose: () => void;
  reload: () => void;
};

export const ManagerSmsPanel = forwardRef<
  ManagerSmsPanelHandle,
  {
    filterResidentEmail?: string | null;
    filterResidentUserId?: string | null;
    threadFilters?: CommunicationThreadFilters;
    filterContacts?: InboxScopedContact[];
    onUnreadCountChange?: (unread: number) => void;
    onSentNavigate?: () => void;
    /**
     * When false (Communication shell), New message lives in the page header.
     * When true (e.g. resident detail), keep an inline compose modal via openCompose().
     */
    allowInlineCompose?: boolean;
    /**
     * Conversations API base (GET grouped / POST send / DELETE). Defaults to the
     * manager route; admin oversight passes its own admin-scoped endpoint, which
     * also copies every send to the admin phone.
     */
    endpoint?: string;
  }
>(function ManagerSmsPanel(
  {
    filterResidentEmail,
    filterResidentUserId,
    threadFilters,
    filterContacts,
    onUnreadCountChange,
    onSentNavigate,
    allowInlineCompose = true,
    endpoint = "/api/manager/sms-conversations",
  },
  ref,
) {
  const { showToast } = useAppUi();
  const [data, setData] = useState<ManagerSmsConversationsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openedSmsIds, setOpenedSmsIds] = useState<Set<string>>(() => loadOpenedIds());
  const [hiddenPhones, setHiddenPhones] = useState<Set<string>>(() => loadHiddenPhones());
  const [composeOpen, setComposeOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ManagerSmsSortId>("newest");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { credentials: "include", cache: "no-store" });
      const body = (await res.json()) as ManagerSmsConversationsPayload & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not load SMS.");
      setData(normalizeManagerSmsConversationsPayload(body));
    } catch (e) {
      if (!opts?.quiet) setError(e instanceof Error ? e.message : "Could not load SMS.");
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep inbound prospect replies visible without a hard refresh.
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void load({ quiet: true });
    };
    const id = window.setInterval(tick, 20_000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  useImperativeHandle(
    ref,
    () => ({
      openCompose: () => {
        if (allowInlineCompose) setComposeOpen(true);
      },
      reload: () => {
        void load();
      },
    }),
    [allowInlineCompose, load],
  );

  const residents = useMemo(() => {
    const all = data?.residents ?? [];
    const email = filterResidentEmail?.trim().toLowerCase();
    const userId = filterResidentUserId?.trim();
    let scoped = all;
    if (email || userId) {
      scoped = all.filter((resident) => {
        if (userId && resident.residentUserId === userId) return true;
        if (email && resident.residentEmail?.trim().toLowerCase() === email) return true;
        return false;
      });
    }
    if (!threadFilters || !filterContacts) return scoped;
    return scoped.filter((resident) =>
      threadPassesCommunicationFilters({
        filters: threadFilters,
        contacts: filterContacts,
        counterpartyEmail: resident.residentEmail,
        propertyLabel: resident.propertyLabel,
        isResidentThread: true,
      }),
    );
  }, [data?.residents, filterResidentEmail, filterResidentUserId, threadFilters, filterContacts]);

  const rows = useMemo(() => {
    return residents
      .map((resident) => {
        const messages = Array.isArray(resident.messages) ? resident.messages : [];
        const lastMessage = messages[messages.length - 1] ?? null;
        const phone = resident.phone?.trim() ?? "";
        return {
          resident,
          messages,
          lastMessage,
          rowId: conversationId(resident),
          unread: smsThreadHasUnread(messages, openedSmsIds),
          hidden: phone ? hiddenPhones.has(phone) : false,
        };
      })
      // iOS Messages: only threads with texts (or not locally deleted).
      .filter((row) => row.lastMessage && !row.hidden);
  }, [hiddenPhones, openedSmsIds, residents]);

  const unreadCount = useMemo(() => rows.filter((r) => r.unread).length, [rows]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [onUnreadCountChange, unreadCount]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => {
          const hay = [
            r.resident.name,
            r.resident.phone,
            r.resident.residentEmail,
            r.resident.propertyLabel,
            r.lastMessage?.body,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
      : rows;
    return sortSmsConversationRows(filtered, sort);
  }, [rows, search, sort]);

  const active = useMemo(
    () => visibleRows.find((r) => r.rowId === activeId) ?? rows.find((r) => r.rowId === activeId) ?? null,
    [activeId, rows, visibleRows],
  );

  useEffect(() => {
    if (!activeId) return;
    threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeId, active?.messages.length]);

  const markOpened = useCallback((messageIds: string[]) => {
    if (messageIds.length === 0) return;
    setOpenedSmsIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of messageIds) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      if (!changed) return prev;
      persistOpenedIds(next);
      return next;
    });
  }, []);

  const openThread = useCallback(
    (rowId: string, messages: ManagerSmsMessageRow[]) => {
      setActiveId(rowId);
      markOpened(messages.filter((m) => m.direction === "inbound").map((m) => m.id));
      setDraft("");
    },
    [markOpened],
  );

  const composeResidents =
    filterResidentEmail || filterResidentUserId ? residents : (data?.residents ?? []);

  const handleSmsSent = useCallback(() => {
    void load().then(() => {
      onSentNavigate?.();
    });
  }, [load, onSentNavigate]);

  const deleteConversation = useCallback(
    async (resident: ManagerSmsResidentConversation) => {
      const phone = resident.phone?.trim();
      if (!phone) {
        showToast("No phone on this conversation.");
        return;
      }
      const ok = window.confirm(
        `Delete conversation with ${resident.name}?\n\nThis removes the texts from Messages on this account.`,
      );
      if (!ok) return;
      setDeletingId(conversationId(resident));
      try {
        const res = await fetch(endpoint, {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          showToast(body.error ?? "Could not delete conversation.");
          return;
        }
        setHiddenPhones((prev) => {
          const next = new Set(prev);
          next.add(phone);
          persistHiddenPhones(next);
          return next;
        });
        if (activeId === conversationId(resident)) setActiveId(null);
        showToast("Conversation deleted.");
        void load();
      } catch {
        showToast("Could not delete conversation.");
      } finally {
        setDeletingId(null);
      }
    },
    [activeId, endpoint, load, showToast],
  );

  async function sendReply() {
    if (!active?.resident.phone) return;
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toPhone: active.resident.phone,
          text,
          residentUserId: active.resident.residentUserId,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(body.error ?? "Could not send.");
        return;
      }
      setDraft("");
      // Un-hide if previously deleted locally and a new text was sent.
      setHiddenPhones((prev) => {
        if (!active.resident.phone || !prev.has(active.resident.phone)) return prev;
        const next = new Set(prev);
        next.delete(active.resident.phone);
        persistHiddenPhones(next);
        return next;
      });
      await load();
    } catch {
      showToast("Could not send.");
    } finally {
      setSending(false);
    }
  }

  const showList = !activeId;
  const showThread = Boolean(activeId && active);

  return (
    <div className="space-y-0">
      {allowInlineCompose ? (
        <ManagerSmsComposeModal
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          residents={composeResidents}
          onSent={handleSmsSent}
          endpoint={endpoint}
        />
      ) : null}

      <div
        className={[
          "overflow-hidden border shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]",
          "rounded-[22px] border-white/10 max-lg:rounded-2xl",
          "max-lg:-mx-1 [html[data-native]_&]:-mx-0 [html[data-native]_&]:rounded-none [html[data-native]_&]:border-x-0",
        ].join(" ")}
        style={{
          backgroundColor: IOS_LIST_BG,
          minHeight: isNativeRuntimeSync()
            ? "min(78dvh, calc(100dvh - 11rem))"
            : "min(70vh, 720px)",
        }}
      >
        <div
          className="grid h-full lg:grid-cols-[minmax(280px,38%)_1fr]"
          style={{
            minHeight: isNativeRuntimeSync()
              ? "min(78dvh, calc(100dvh - 11rem))"
              : "min(70vh, 720px)",
          }}
        >
          {/*
            Conversation list.
            min-w-0 on both grid items: a grid item defaults to min-width:auto,
            so the nowrap conversation rows set the column's width. Without it
            the single mobile column blows out to its content width and
            everything right of the search box — including the sort control —
            is pushed off-screen behind the panel's overflow-hidden.
          */}
          <section
            className={`flex min-h-0 min-w-0 flex-col ${showThread ? "hidden lg:flex lg:border-r" : "flex"}`}
            style={{ borderColor: IOS_HAIRLINE }}
          >
            <header className="px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top,0px))] lg:pt-4">
              <h2 className="text-[17px] font-semibold tracking-tight text-white">Messages</h2>
            </header>

            <div className="flex items-center gap-2 px-3 pb-2">
              <label className="relative block min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  enterKeyHint="search"
                  className="h-10 w-full rounded-[10px] border-0 bg-white/[0.12] pl-9 pr-3 text-[16px] text-white outline-none placeholder:text-white/40 sm:h-9 sm:text-[15px]"
                  data-attr="sms-messages-search"
                />
              </label>
              <label className="sr-only" htmlFor="sms-sort">
                Sort conversations
              </label>
              <select
                id="sms-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as ManagerSmsSortId)}
                className="h-10 shrink-0 rounded-[10px] border-0 bg-white/[0.12] px-2 text-[13px] text-white outline-none sm:h-9"
                data-attr="sms-messages-sort"
                aria-label="Sort conversations"
              >
                {MANAGER_SMS_SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-neutral-900 text-white">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
              {loading ? (
                <p className="px-4 py-8 text-center text-[15px] text-white/45">Loading…</p>
              ) : null}
              {error ? (
                <div className="px-4 py-6 text-center text-[15px] text-rose-300">
                  {error}{" "}
                  <button type="button" className="underline" onClick={() => void load()}>
                    Retry
                  </button>
                </div>
              ) : null}
              {!loading && !error && visibleRows.length === 0 ? (
                <p className="px-6 py-16 text-center text-[15px] text-white/45">
                  No Messages
                  <span className="mt-1 block text-[13px] text-white/30">
                    Use New message above to start a conversation.
                  </span>
                </p>
              ) : null}
              <ul>
                {visibleRows.map((row) => (
                  <ConversationRow
                    key={row.rowId}
                    name={row.resident.name}
                    subtitle={
                      row.resident.propertyLabel?.trim() ||
                      formatPhoneDisplay(row.resident.phone) ||
                      row.resident.residentEmail ||
                      ""
                    }
                    preview={
                      row.lastMessage
                        ? `${row.lastMessage.direction === "outbound" ? "You: " : ""}${row.lastMessage.body}`
                        : ""
                    }
                    time={iosListTimestamp(row.lastMessage?.createdAt)}
                    unread={row.unread}
                    editing={false}
                    deleting={deletingId === row.rowId}
                    selected={activeId === row.rowId}
                    onOpen={() => openThread(row.rowId, row.messages)}
                    onDelete={() => void deleteConversation(row.resident)}
                  />
                ))}
              </ul>
            </div>
          </section>

          {/* Thread */}
          <section
            className={`min-h-0 min-w-0 flex-col ${showThread ? "flex" : "hidden lg:flex"}`}
            style={{ backgroundColor: IOS_THREAD_BG }}
          >
            {!active ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <p className="text-[20px] font-semibold text-white/90">Messages</p>
                <p className="mt-2 max-w-xs text-[15px] leading-snug text-white/40">
                  Select a conversation, or use New message above.
                </p>
              </div>
            ) : (
              <>
                <header
                  className="flex items-center gap-1 border-b px-1 py-1.5 backdrop-blur-xl sm:px-2 sm:py-2"
                  style={{
                    backgroundColor: "rgba(28, 28, 30, 0.92)",
                    borderColor: IOS_HAIRLINE,
                    paddingTop: "max(0.35rem, env(safe-area-inset-top, 0px))",
                  }}
                >
                  <button
                    type="button"
                    className="flex min-h-11 touch-manipulation items-center gap-0.5 rounded-lg px-1 py-2 text-[17px] active:opacity-60 lg:hidden"
                    style={{ color: IOS_BLUE }}
                    data-attr="sms-messages-back"
                    onClick={() => setActiveId(null)}
                  >
                    <ChevronLeft className="h-7 w-7" strokeWidth={2.25} />
                    <span>Messages</span>
                  </button>
                  <div className="min-w-0 flex-1 px-1 text-center">
                    <p className="truncate text-[16px] font-semibold text-white">{active.resident.name}</p>
                    <p className="truncate text-[12px] text-white/45">
                      {formatPhoneDisplay(active.resident.phone) ||
                        active.resident.propertyLabel ||
                        active.resident.residentEmail ||
                        " "}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-lg active:opacity-60"
                    style={{ color: IOS_BLUE }}
                    aria-label="Delete conversation"
                    data-attr="sms-messages-thread-delete"
                    disabled={deletingId === active.rowId}
                    onClick={() => void deleteConversation(active.resident)}
                  >
                    <Trash2 className="h-5 w-5" strokeWidth={1.75} />
                  </button>
                </header>

                <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-3 py-3 [-webkit-overflow-scrolling:touch] sm:space-y-2 sm:py-4">
                  {active.messages.length === 0 ? (
                    <p className="py-10 text-center text-[15px] text-white/40">No messages yet</p>
                  ) : (
                    active.messages.map((msg) => (
                      <Bubble key={msg.id} message={msg} />
                    ))
                  )}
                  <div ref={threadEndRef} />
                </div>

                <form
                  className="flex items-end gap-2 border-t px-3 pt-2"
                  style={{
                    backgroundColor: IOS_LIST_BG,
                    borderColor: IOS_HAIRLINE,
                    paddingBottom: "max(0.65rem, env(safe-area-inset-bottom, 0px))",
                  }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendReply();
                  }}
                >
                  <textarea
                    rows={1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Text Message"
                    maxLength={1600}
                    enterKeyHint="send"
                    className="max-h-28 min-h-[36px] flex-1 resize-none rounded-[20px] border bg-black/25 px-3.5 py-2 text-[16px] leading-snug text-white outline-none placeholder:text-white/35"
                    style={{ borderColor: "rgba(255,255,255,0.18)" }}
                    data-attr="sms-messages-reply"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendReply();
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="mb-0.5 flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-full text-white disabled:opacity-35"
                    style={{ backgroundColor: draft.trim() ? IOS_BLUE : "rgba(120,120,128,0.45)" }}
                    aria-label="Send"
                    data-attr="sms-messages-send"
                  >
                    <span className="text-[17px] font-semibold leading-none">↑</span>
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
});

function Bubble({ message }: { message: ManagerSmsMessageRow }) {
  const outbound = message.direction === "outbound";
  return (
    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(88%,26rem)] px-3.5 py-2 text-[16px] leading-[1.25] text-white ${
          outbound ? "rounded-[18px] rounded-br-[5px]" : "rounded-[18px] rounded-bl-[5px]"
        }`}
        style={{
          backgroundColor: outbound ? IOS_BLUE : IOS_GRAY_BUBBLE,
        }}
      >
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.body || " "}</p>
      </div>
    </div>
  );
}

function ConversationRow({
  name,
  subtitle,
  preview,
  time,
  unread,
  editing,
  deleting,
  selected,
  onOpen,
  onDelete,
}: {
  name: string;
  subtitle: string;
  preview: string;
  time: string;
  unread: boolean;
  editing: boolean;
  deleting: boolean;
  selected: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const DELETE_W = 76;
  const [offset, setOffset] = useState(0);
  const [armed, setArmed] = useState(false);
  const startX = useRef<number | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (!editing) {
      setArmed(false);
      setOffset(0);
    }
  }, [editing]);

  const reveal = editing ? (armed ? -DELETE_W : 0) : offset;

  const onPointerDown = (e: ReactPointerEvent) => {
    if (editing) return;
    startX.current = e.clientX;
    dragging.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (startX.current == null || editing) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 8) dragging.current = true;
    // Swipe left to reveal delete (iOS).
    setOffset(Math.max(-DELETE_W, Math.min(0, dx)));
  };
  const onPointerUp = () => {
    if (startX.current == null) return;
    setOffset((cur) => (cur < -DELETE_W / 2 ? -DELETE_W : 0));
    startX.current = null;
  };

  return (
    <li className="relative isolate overflow-hidden" style={{ backgroundColor: IOS_LIST_BG }}>
      {/* Delete action sits under the row — only visible when slid open */}
      <div
        className="absolute inset-y-0 right-0 flex items-stretch"
        style={{ width: DELETE_W }}
        aria-hidden={reveal === 0}
      >
        <button
          type="button"
          className="flex w-full touch-manipulation items-center justify-center text-[15px] font-medium text-white active:brightness-90"
          style={{ backgroundColor: IOS_DELETE }}
          data-attr="sms-messages-swipe-delete"
          disabled={deleting || reveal === 0}
          tabIndex={reveal === 0 ? -1 : 0}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          {deleting ? "…" : "Delete"}
        </button>
      </div>

      <div
        className={[
          "relative z-[1] flex cursor-pointer items-center gap-3 px-4 py-3 transition-transform duration-200 ease-out",
          "touch-pan-y",
          selected ? "lg:bg-white/[0.07]" : "",
        ].join(" ")}
        style={{
          backgroundColor: IOS_LIST_BG,
          transform: `translate3d(${reveal}px,0,0)`,
          borderBottom: `0.5px solid ${IOS_HAIRLINE}`,
        }}
        onClick={() => {
          if (dragging.current) {
            dragging.current = false;
            return;
          }
          if (editing) {
            setArmed((v) => !v);
            return;
          }
          if (offset < -8) {
            setOffset(0);
            return;
          }
          onOpen();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {editing ? (
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 touch-manipulation items-center justify-center rounded-full text-white"
            style={{ backgroundColor: IOS_DELETE }}
            aria-label={armed ? `Hide delete for ${name}` : `Delete ${name}`}
            aria-expanded={armed}
            data-attr="sms-messages-edit-delete"
            disabled={deleting}
            onClick={(e) => {
              e.stopPropagation();
              setArmed((v) => !v);
            }}
          >
            <span className="text-[18px] font-bold leading-none">−</span>
          </button>
        ) : null}
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={`truncate text-[16px] tracking-tight ${
                unread ? "font-semibold text-white" : "font-normal text-white"
              }`}
            >
              {name}
            </p>
            <span className="shrink-0 text-[14px] tabular-nums text-white/40">{time}</span>
          </div>
          {subtitle ? <p className="truncate text-[13px] text-white/40">{subtitle}</p> : null}
          <div className="mt-0.5 flex items-center gap-2">
            <p
              className={`min-w-0 flex-1 truncate text-[14px] ${
                unread ? "font-medium text-white/75" : "text-white/45"
              }`}
            >
              {preview || " "}
            </p>
            {unread ? (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: IOS_BLUE }} />
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
