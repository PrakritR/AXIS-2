"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, ChevronLeft } from "lucide-react";
import { PortalEmptyIcon, PortalEmptyState } from "@/components/portal/portal-empty-state";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { DEMO_INBOX_REPLY_PREFILL_EVENT } from "@/lib/demo/demo-playback";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { isNativeRuntimeSync } from "@/lib/native/detect-native";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE, 
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableColGroup,
  portalTableColumnPercents,
  PORTAL_TABLE_INBOX_COLUMN_WEIGHTS,
  PORTAL_DETAIL_BTN,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PortalTableInlineExpand,
  PortalResponsiveDataView,
  PortalTableDetailActions,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { TabItem } from "@/components/ui/tabs";
import type { InboxThreadMessage } from "@/lib/portal-inbox-storage";

/** Same chrome as other portal data tables */
export const PORTAL_INBOX_TABLE_WRAP = PORTAL_DATA_TABLE_WRAP;

export const PORTAL_INBOX_EMPTY_WRAP =
  "flex flex-col items-center justify-center rounded-2xl border border-border bg-accent/25 px-4 py-16 text-center sm:py-20";

export function InboxEmptyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

export function PortalInboxEmptyState({ title }: { title: string; hint?: ReactNode }) {
  return <PortalEmptyState title={title} icon="inbox" />;
}

export const INBOX_TAB_DEFS = [
  { id: "unopened", label: "Unopened" },
  { id: "opened", label: "Opened" },
  { id: "schedule", label: "Schedule" },
  { id: "sent", label: "Sent" },
  { id: "trash", label: "Trash" },
] as const;

/** Compose and send an outbound message (client state only until a backend exists). */
export function InboxComposeModal({
  open,
  onClose,
  onSend,
  title = "New message",
}: {
  open: boolean;
  onClose: () => void;
  onSend: (payload: { to: string; subject: string; body: string }) => void;
  title?: string;
}) {
  const { showToast } = useAppUi();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setTo("");
        setSubject("");
        setBody("");
      });
    }
  }, [open]);

  const submit = () => {
    const t = to.trim();
    const s = subject.trim();
    const b = body.trim();
    if (!t || !s || !b) {
      showToast("Enter recipient email, subject, and message.");
      return;
    }
    onSend({ to: t, subject: s, body: b });
  };

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-muted" htmlFor="inbox-compose-to">
            To (email)
          </label>
          <Input
            id="inbox-compose-to"
            type="email"
            className="mt-1.5"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted" htmlFor="inbox-compose-subject">
            Subject
          </label>
          <Input id="inbox-compose-subject" className="mt-1.5" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted" htmlFor="inbox-compose-body">
            Message
          </label>
          <Textarea
            id="inbox-compose-body"
            className="mt-1.5 min-h-[140px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
          />
        </div>
        <div className="flex flex-wrap justify-start gap-2 pt-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" className="rounded-full" onClick={submit}>
            Send
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export type InboxTabId = (typeof INBOX_TAB_DEFS)[number]["id"];

export function inboxTabItems(basePath: string): TabItem[] {
  return INBOX_TAB_DEFS.map((t) => ({
    id: t.id,
    label: t.label,
    href: `${basePath}/inbox/${t.id}`,
  }));
}

export type PortalInboxTableRow = {
  id: string;
  name: string;
  email: string;
  subject: string;
  whenLabel: string;
  read: boolean;
  /** When false, row cannot be bulk-selected (e.g. already sent/cancelled). */
  selectable?: boolean;
};

export type PortalInboxTableLayout = "default" | "schedule";

export type PortalInboxSelectionProps = {
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  onToggleSelectAll: () => void;
  allSelected: boolean;
  selectableCount: number;
};

export function PortalInboxMessageTable({
  rows,
  onMarkRead,
  getDetailBody,
  getThreadMessages,
  onReply,
  expandedId,
  onToggleExpand,
  renderExtraActions,
  primaryPartyHeader = "From",
  layout = "default",
  selection,
}: {
  rows: PortalInboxTableRow[];
  onMarkRead?: (id: string) => void;
  /** Full message body shown in an expandable row (Details). */
  getDetailBody?: (row: PortalInboxTableRow) => string | undefined;
  getThreadMessages?: (row: PortalInboxTableRow) => InboxThreadMessage[];
  onReply?: (row: PortalInboxTableRow, text: string) => void | Promise<void>;
  expandedId?: string | null;
  onToggleExpand?: (id: string) => void;
  /** Trash / restore / delete — shown in the expanded row only (with Mark read, Reply, Hide). */
  renderExtraActions?: (row: PortalInboxTableRow) => ReactNode;
  primaryPartyHeader?: "From" | "To" | "Recipient" | "From / To";
  /** Schedule tab uses Recipient + Send date & time + Subject (no trailing When). */
  layout?: PortalInboxTableLayout;
  selection?: PortalInboxSelectionProps;
}) {
  const { showToast } = useAppUi();
  const [replyDraftById, setReplyDraftById] = useState<Record<string, string>>({});
  const [replyBusyId, setReplyBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!isDemoModeActive()) return;
    const onPrefill = (e: Event) => {
      const detail = (e as CustomEvent<{ rowId?: string; text?: string }>).detail;
      const rowId = detail?.rowId?.trim();
      const text = detail?.text?.trim();
      if (!rowId || !text) return;
      setReplyDraftById((prev) => ({ ...prev, [rowId]: text }));
    };
    window.addEventListener(DEMO_INBOX_REPLY_PREFILL_EVENT, onPrefill as EventListener);
    return () => window.removeEventListener(DEMO_INBOX_REPLY_PREFILL_EVENT, onPrefill as EventListener);
  }, []);

  const renderExpandedContent = (row: PortalInboxTableRow, detailText: string | undefined, extra: ReactNode) => {
    const hasMarkRead = Boolean(!row.read && onMarkRead);
    return (
      <>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Conversation</p>
        <div className="mt-2 space-y-3">
          {(getThreadMessages?.(row) ?? [
            {
              id: `${row.id}-root`,
              from: row.name,
              body: (detailText ?? "").trim() || "—",
              at: row.whenLabel,
            },
          ]).map((msg) => (
            <div key={msg.id} className="rounded-xl border border-border bg-accent/20 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-foreground">{msg.from}</p>
              <p className="text-[10px] text-muted">{msg.at}</p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted">{msg.body}</p>
            </div>
          ))}
        </div>
        {onReply ? (
          <div className="mt-4">
            <Textarea
              rows={3}
              placeholder="Write a reply…"
              value={replyDraftById[row.id] ?? ""}
              onChange={(e) => setReplyDraftById((prev) => ({ ...prev, [row.id]: e.target.value }))}
              className="text-sm"
            />
          </div>
        ) : null}
        <PortalTableDetailActions>
          {hasMarkRead ? (
            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} data-attr="inbox-mark-read" onClick={() => onMarkRead?.(row.id)}>
              Mark read
            </Button>
          ) : null}
          {extra}
          {onReply ? (
            <Button
              type="button"
              variant="outline"
              className={PORTAL_DETAIL_BTN}
              data-attr="inbox-reply-send"
              disabled={replyBusyId === row.id || !(replyDraftById[row.id] ?? "").trim()}
              onClick={() => {
                const text = (replyDraftById[row.id] ?? "").trim();
                if (!text) return;
                setReplyBusyId(row.id);
                void Promise.resolve(onReply(row, text))
                  .then(() => {
                    setReplyDraftById((prev) => ({ ...prev, [row.id]: "" }));
                    showToast("Reply sent.");
                  })
                  .catch(() => showToast("Could not send reply."))
                  .finally(() => setReplyBusyId(null));
              }}
            >
              {replyBusyId === row.id ? "Sending…" : "Send reply"}
            </Button>
          ) : null}
        </PortalTableDetailActions>
      </>
    );
  };

  const showSelection = Boolean(selection && selection.selectableCount > 0);
  const dataColCount = 3;
  const detailColSpan = dataColCount + (showSelection ? 1 : 0);
  const isScheduleLayout = layout === "schedule";
  const partyHeader =
    primaryPartyHeader === "Recipient" || isScheduleLayout ? "Recipient" : primaryPartyHeader;
  const middleHeader = isScheduleLayout ? "Send date & time" : "Subject";
  const trailingHeader = isScheduleLayout ? "Subject" : "When";

  const renderRowCheckbox = (row: PortalInboxTableRow, className = "") => {
    if (!selection || row.selectable === false) return null;
    return (
      <input
        type="checkbox"
        className={`h-4 w-4 shrink-0 rounded border-border accent-primary ${className}`}
        checked={selection.selectedIds.has(row.id)}
        onChange={() => selection.onToggleSelected(row.id)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select message ${row.subject}`}
      />
    );
  };

  const mobileCards = (
    <>
      {rows.map((row) => {
        const detailText = getDetailBody?.(row);
        const rowExpandable = Boolean(onToggleExpand);
        const isExpanded = expandedId === row.id && rowExpandable;
        const hasMarkRead = Boolean(!row.read && onMarkRead);
        const extra = renderExtraActions?.(row);

        return (
          <div key={row.id} id={`portal-inbox-thread-${row.id}`} className={PORTAL_MOBILE_CARD_CLASS}>
            <div className="flex items-start gap-3">
              {renderRowCheckbox(row, "mt-1")}
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => (rowExpandable ? onToggleExpand?.(row.id) : undefined)}
                disabled={!rowExpandable}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {rowExpandable ? (
                      <PortalTableInlineExpand
                        expanded={isExpanded}
                        className={`truncate font-semibold text-foreground ${!row.read ? "" : "text-foreground/90"}`}
                      >
                        {!row.read ? "● " : ""}
                        {row.name}
                      </PortalTableInlineExpand>
                    ) : (
                      <p className={`truncate font-semibold text-foreground ${!row.read ? "" : "text-foreground/90"}`}>
                        {!row.read ? "● " : ""}
                        {row.name}
                      </p>
                    )}
                    {row.email ? <p className="mt-0.5 truncate text-xs text-muted">{row.email}</p> : null}
                    {isScheduleLayout ? (
                      <p className="mt-1 truncate text-xs text-muted">{row.whenLabel}</p>
                    ) : null}
                    <p className={`truncate text-xs font-medium text-foreground ${isScheduleLayout ? "mt-1" : "mt-0.5"}`}>
                      {row.subject}
                    </p>
                  </div>
                  {!isScheduleLayout ? (
                    <p className="shrink-0 text-[11px] text-muted">{row.whenLabel}</p>
                  ) : null}
                </div>
              </button>
            </div>
            {!rowExpandable && (hasMarkRead || extra) ? (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                {hasMarkRead ? (
                  <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => onMarkRead?.(row.id)}>
                    Mark read
                  </Button>
                ) : null}
                {extra}
              </div>
            ) : null}
            {isExpanded ? (
              <div className="mt-3 border-t border-border pt-3">{renderExpandedContent(row, detailText, extra)}</div>
            ) : null}
          </div>
        );
      })}
    </>
  );

  const desktopTable = (
    <div className={PORTAL_INBOX_TABLE_WRAP}>
      <div className={PORTAL_DATA_TABLE_SCROLL}>
        <table className={PORTAL_DATA_TABLE}>
          <PortalDataTableColGroup
            percents={[
              ...(showSelection
                ? portalTableColumnPercents(dataColCount, [3, ...PORTAL_TABLE_INBOX_COLUMN_WEIGHTS])
                : portalTableColumnPercents(dataColCount, PORTAL_TABLE_INBOX_COLUMN_WEIGHTS)),
            ]}
          />
          <thead>
            <tr className={PORTAL_TABLE_HEAD_ROW}>
              {showSelection ? (
                <th className={`${MANAGER_TABLE_TH} w-10 text-left`}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-primary"
                    checked={selection!.allSelected}
                    onChange={() => selection!.onToggleSelectAll()}
                    aria-label="Select all messages"
                  />
                </th>
              ) : null}
              <th className={`${MANAGER_TABLE_TH} text-left`}>{partyHeader}</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>{middleHeader}</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>{trailingHeader}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const detailText = getDetailBody?.(row);
              const rowExpandable = Boolean(onToggleExpand);
              const isExpanded = expandedId === row.id && rowExpandable;
              const extra = renderExtraActions?.(row);

              return (
                <Fragment key={row.id}>
                  <tr
                    id={`portal-inbox-thread-${row.id}`}
                    className={rowExpandable ? PORTAL_TABLE_TR_EXPANDABLE : PORTAL_TABLE_TR}
                    onClick={
                      rowExpandable
                        ? createPortalRowExpandClick(() => onToggleExpand?.(row.id))
                        : undefined
                    }
                    aria-expanded={rowExpandable ? isExpanded : undefined}
                  >
                    {showSelection ? (
                      <td className={`${PORTAL_TABLE_TD} w-10 align-middle`}>{renderRowCheckbox(row)}</td>
                    ) : null}
                    <td className={`${PORTAL_TABLE_TD} align-middle`}>
                      {rowExpandable ? (
                        <PortalTableInlineExpand expanded={isExpanded} className="font-medium text-foreground">
                          {row.name}
                        </PortalTableInlineExpand>
                      ) : (
                        <p className="font-medium text-foreground">{row.name}</p>
                      )}
                      {row.email ? <p className="mt-0.5 text-xs text-muted">{row.email}</p> : null}
                    </td>
                    <td className={`${PORTAL_TABLE_TD} align-middle text-muted`}>
                      {isScheduleLayout ? row.whenLabel : row.subject}
                    </td>
                    <td className={`${PORTAL_TABLE_TD} align-middle ${isScheduleLayout ? "font-medium text-foreground" : "text-muted"}`}>
                      {isScheduleLayout ? row.subject : row.whenLabel}
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className={PORTAL_TABLE_DETAIL_ROW}>
                      <td colSpan={detailColSpan} className={`${PORTAL_TABLE_DETAIL_CELL} text-left`}>
                        {renderExpandedContent(row, detailText, extra)}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return <PortalResponsiveDataView mobile={mobileCards} desktop={desktopTable} />;
}

/* ------------------------------------------------------------------ *
 * Inline two-pane inbox primitives (Airbnb / Intercom / Front style). *
 *                                                                     *
 * A conversation list on the left; the open thread rendered as chat   *
 * bubbles with a persistent composer on the right — no modal to send  *
 * a reply. Everything below is theme-tokened (no hardcoded colours),  *
 * so it matches the rest of the site in light and dark and is         *
 * native-safe. The manager email inbox consumes these today; the      *
 * resident / vendor / admin conversions build on the same primitives. *
 * These are ADDITIVE — the table primitives above stay for the        *
 * surfaces not yet migrated.                                          *
 * ------------------------------------------------------------------ */

export type InboxMessageDirection = "inbound" | "outbound";

export type InboxBubbleMessage = {
  id: string;
  /** Display name of the author (shown above inbound bubbles when grouped). */
  author: string;
  body: string;
  /** Human timestamp label — already formatted by the caller. */
  at: string;
  direction: InboxMessageDirection;
  /** Optional delivery/status caption under the bubble (e.g. "Scheduled"). */
  status?: string;
};

/** Scrollable body for a conversation list pane. */
export const INBOX_LIST_SCROLL =
  "min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]";

export function inboxInitials(name: string): string {
  const parts = name
    .trim()
    .replace(/^(to|from):\s*/i, "")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

/** Circular initials avatar in the site accent (cobalt in light, indigo in dark). */
export function InboxAvatar({ name, className = "" }: { name: string; className?: string }) {
  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white ${className}`}
      style={{ background: "linear-gradient(160deg, var(--primary) 0%, var(--primary-alt) 100%)" }}
      aria-hidden
    >
      {inboxInitials(name)}
    </div>
  );
}

/** One row in the left conversation list. */
export function InboxConversationRow({
  name,
  subtitle,
  preview,
  time,
  unread = false,
  selected = false,
  onOpen,
  leading,
  previewPrefix,
}: {
  name: string;
  subtitle?: string;
  preview: string;
  time: string;
  unread?: boolean;
  selected?: boolean;
  onOpen: () => void;
  /** Optional slot before the avatar (e.g. a bulk-select checkbox). */
  leading?: ReactNode;
  /** e.g. "You: " when the last message was outbound. */
  previewPrefix?: string;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 border-b border-border px-3 py-2.5 transition-colors ${
        selected ? "bg-accent" : "hover:bg-foreground/[0.03]"
      }`}
    >
      {leading}
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <InboxAvatar name={name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={`truncate text-sm ${
                unread ? "font-semibold text-foreground" : "font-medium text-foreground/90"
              }`}
            >
              {name}
            </p>
            <span className="shrink-0 text-[11px] tabular-nums text-muted">{time}</span>
          </div>
          {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
          <div className="mt-0.5 flex items-center gap-2">
            <p
              className={`min-w-0 flex-1 truncate text-xs ${
                unread ? "font-medium text-foreground/75" : "text-muted"
              }`}
            >
              {previewPrefix ?? ""}
              {preview || " "}
            </p>
            {unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden /> : null}
          </div>
        </div>
      </button>
    </div>
  );
}

/** A single chat bubble — outbound right (accent), inbound left (neutral). */
export function InboxBubble({
  message,
  showAuthor = false,
}: {
  message: InboxBubbleMessage;
  showAuthor?: boolean;
}) {
  const outbound = message.direction === "outbound";
  return (
    <div className={`flex flex-col ${outbound ? "items-end" : "items-start"}`}>
      {showAuthor && !outbound ? (
        <span className="mb-1 px-1 text-[11px] font-medium text-muted">{message.author}</span>
      ) : null}
      <div
        className={`max-w-[min(85%,32rem)] px-3.5 py-2 text-sm leading-relaxed ${
          outbound
            ? "rounded-2xl rounded-br-md text-primary-foreground"
            : "rounded-2xl rounded-bl-md border border-border bg-secondary text-foreground"
        }`}
        style={outbound ? { background: "var(--btn-primary)" } : undefined}
      >
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.body || " "}</p>
      </div>
      <span className="mt-1 px-1 text-[11px] text-muted">
        {message.at}
        {message.status ? ` · ${message.status}` : ""}
      </span>
    </div>
  );
}

/** Persistent composer pinned to the bottom of an open thread. */
export function InboxComposer({
  value,
  onChange,
  onSubmit,
  sending = false,
  disabled = false,
  placeholder = "Write a message…",
  maxLength,
  hint,
  dataAttr,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  sending?: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  hint?: ReactNode;
  dataAttr?: string;
}) {
  const canSend = !sending && !disabled && value.trim().length > 0;
  return (
    <form
      className="shrink-0 border-t border-border bg-card px-3 py-2.5"
      style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom, 0px))" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
    >
      <div className="flex items-end gap-2">
        <textarea
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          enterKeyHint="send"
          data-attr={dataAttr}
          className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl border border-border bg-background px-3.5 py-2.5 text-sm leading-snug text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSubmit();
            }
          }}
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send"
          data-attr={dataAttr ? `${dataAttr}-send` : undefined}
          className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary-foreground transition-[filter,opacity] hover:brightness-110 disabled:opacity-40"
          style={{ background: "var(--btn-primary)" }}
        >
          {sending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <ArrowUp className="h-5 w-5" strokeWidth={2.25} />
          )}
        </button>
      </div>
      {hint || maxLength ? (
        <div className="mt-1 flex items-center justify-between gap-2 px-1">
          <span className="text-[11px] text-muted">{hint}</span>
          {maxLength ? (
            <span className="text-[11px] tabular-nums text-muted">
              {value.trim().length}/{maxLength}
            </span>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

/** Right-pane placeholder shown when no conversation is selected. */
export function InboxThreadEmpty({
  title = "Select a conversation",
  hint = "Choose a message on the left to read it and reply here.",
}: {
  title?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-accent/40 text-muted">
        <PortalEmptyIcon kind="inbox" className="h-6 w-6" />
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-muted">{hint}</p>
    </div>
  );
}

/** Right pane: thread header, scrolling bubble history, and a composer slot. */
export function InboxThreadView({
  title,
  subtitle,
  messages,
  showAuthors = false,
  onBack,
  headerActions,
  composer,
  emptyLabel = "No messages yet.",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  messages: InboxBubbleMessage[];
  /** Show the author name above inbound bubbles (multi-party threads). */
  showAuthors?: boolean;
  /** Mobile-only back affordance returning to the list. */
  onBack?: () => void;
  headerActions?: ReactNode;
  /** Pass an <InboxComposer/>; omit for a read-only thread (e.g. Trash). */
  composer?: ReactNode;
  emptyLabel?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Optional call: scrollIntoView is absent in jsdom / non-DOM environments.
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header
        className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-2 py-2"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))" }}
      >
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex min-h-9 items-center gap-0.5 rounded-lg px-1 text-sm font-medium text-primary lg:hidden"
            aria-label="Back to conversations"
            data-attr="inbox-thread-back"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
            <span>Inbox</span>
          </button>
        ) : null}
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
        </div>
        {headerActions ? <div className="flex shrink-0 items-center gap-1.5">{headerActions}</div> : null}
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-background/40 px-3 py-4 [-webkit-overflow-scrolling:touch]">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">{emptyLabel}</p>
        ) : (
          messages.map((m) => <InboxBubble key={m.id} message={m} showAuthor={showAuthors} />)
        )}
        <div ref={endRef} />
      </div>

      {composer}
    </div>
  );
}

/** Responsive two-pane shell: list + thread on desktop; list-then-thread on mobile.
 *
 * The shell fills the space between its top edge and the bottom of the viewport
 * (measured at mount / resize) so the composer stays pinned and visible without
 * a fixed height that would overflow one page header and under-fill another —
 * important because this is shared across portals whose header stacks differ. */
export function InboxTwoPane({
  list,
  thread,
  threadOpen,
  className = "",
}: {
  list: ReactNode;
  thread: ReactNode;
  /** On narrow widths, show the thread pane (and hide the list) when true. */
  threadOpen: boolean;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  useEffect(() => {
    const measure = () => {
      const el = rootRef.current;
      if (!el || typeof window === "undefined") return;
      const top = el.getBoundingClientRect().top;
      // The mobile portal renders a fixed bottom nav that overlays the viewport;
      // reserve its height so the composer never hides behind it. It is
      // display:none on desktop, so this contributes 0 there.
      const bottomNav = document.querySelector(".portal-native-bottom-nav");
      const navHeight = bottomNav ? bottomNav.getBoundingClientRect().height : 0;
      const avail = window.innerHeight - top - navHeight - 16;
      setMeasuredHeight(Math.max(440, Math.min(760, avail)));
    };
    measure();
    // Re-measure after layout settles — the fixed bottom nav (and final card
    // position) may not have their size on the first synchronous pass.
    const raf = requestAnimationFrame(measure);
    const timer = window.setTimeout(measure, 300);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
    };
  }, []);

  const fallback = isNativeRuntimeSync() ? "min(78dvh, calc(100dvh - 12rem))" : "min(68vh, 640px)";
  const height = measuredHeight ? `${measuredHeight}px` : fallback;

  return (
    <div
      ref={rootRef}
      className={`overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] ${className}`}
      style={{ height }}
    >
      <div className="grid h-full lg:grid-cols-[minmax(300px,34%)_1fr]">
        <section
          className={`min-h-0 min-w-0 flex-col border-border lg:border-r ${
            threadOpen ? "hidden lg:flex" : "flex"
          }`}
        >
          {list}
        </section>
        <section className={`min-h-0 min-w-0 flex-col ${threadOpen ? "flex" : "hidden lg:flex"}`}>
          {thread}
        </section>
      </div>
    </div>
  );
}
