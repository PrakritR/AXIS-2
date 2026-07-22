"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { PortalEmptyState } from "@/components/portal/portal-empty-state";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { DEMO_INBOX_REPLY_PREFILL_EVENT } from "@/lib/demo/demo-playback";
import { isDemoModeActive } from "@/lib/demo/demo-session";
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
