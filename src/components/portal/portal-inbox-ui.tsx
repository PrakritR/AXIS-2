"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { PortalEmptyState } from "@/components/portal/portal-empty-state";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_DETAIL_BTN,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
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
        <div className="flex flex-wrap justify-end gap-2 pt-2">
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
  topic: string;
  preview: string;
  whenLabel: string;
  read: boolean;
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
  primaryPartyHeader?: "From" | "To";
}) {
  const { showToast } = useAppUi();
  const [replyDraftById, setReplyDraftById] = useState<Record<string, string>>({});
  const [replyBusyId, setReplyBusyId] = useState<string | null>(null);

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
            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => onMarkRead?.(row.id)}>
              Mark read
            </Button>
          ) : null}
          {extra}
          {onReply ? (
            <Button
              type="button"
              variant="outline"
              className={PORTAL_DETAIL_BTN}
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
          ) : (
            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => showToast("Reply sent.")}>
              Reply
            </Button>
          )}
        </PortalTableDetailActions>
      </>
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
          <div key={row.id} className={PORTAL_MOBILE_CARD_CLASS}>
            <button
              type="button"
              className="w-full text-left"
              onClick={() => (rowExpandable ? onToggleExpand?.(row.id) : undefined)}
              disabled={!rowExpandable}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`truncate font-semibold text-foreground ${!row.read ? "" : "text-foreground/90"}`}>
                    {!row.read ? "● " : ""}
                    {row.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs font-medium text-foreground">{row.topic}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{row.preview}</p>
                </div>
                <p className="shrink-0 text-[11px] text-muted">{row.whenLabel}</p>
              </div>
            </button>
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
            ) : rowExpandable ? (
              <div className="mt-2">
                <Button
                  type="button"
                  variant="outline"
                  className={PORTAL_DETAIL_BTN}
                  onClick={() => onToggleExpand?.(row.id)}
                >
                  {isExpanded ? "Less" : "Open"}
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );

  const desktopTable = (
    <div className={PORTAL_INBOX_TABLE_WRAP}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className={PORTAL_TABLE_HEAD_ROW}>
              <th className={`${MANAGER_TABLE_TH} text-left`}>{primaryPartyHeader}</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Topic</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Preview</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>When</th>
              {!onToggleExpand ? (
                <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const detailText = getDetailBody?.(row);
              const rowExpandable = Boolean(onToggleExpand);
              const isExpanded = expandedId === row.id && rowExpandable;
              const hasMarkRead = Boolean(!row.read && onMarkRead);
              const extra = renderExtraActions?.(row);
              const fallbackSummaryActions = !rowExpandable && (hasMarkRead || extra);
              const detailColSpan = rowExpandable ? 4 : 5;

              return (
                <Fragment key={row.id}>
                  <tr
                    className={rowExpandable ? PORTAL_TABLE_TR_EXPANDABLE : PORTAL_TABLE_TR}
                    onClick={
                      rowExpandable
                        ? createPortalRowExpandClick(() => onToggleExpand?.(row.id))
                        : undefined
                    }
                    aria-expanded={rowExpandable ? isExpanded : undefined}
                  >
                    <td className={`${PORTAL_TABLE_TD} align-middle`}>
                      <p className="font-medium text-foreground">{row.name}</p>
                      <p className="mt-0.5 text-xs text-muted">{row.email}</p>
                    </td>
                    <td className={`${PORTAL_TABLE_TD} align-middle text-foreground`}>{row.topic}</td>
                    <td className={`max-w-[220px] ${PORTAL_TABLE_TD} align-middle text-muted`}>
                      <span className="line-clamp-2">{row.preview}</span>
                    </td>
                    <td className={`${PORTAL_TABLE_TD} align-middle text-muted`}>{row.whenLabel}</td>
                    {!rowExpandable ? (
                      <td className={`${PORTAL_TABLE_TD} text-right align-middle`}>
                        {fallbackSummaryActions ? (
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {hasMarkRead ? (
                              <Button
                                type="button"
                                variant="outline"
                                className={PORTAL_TABLE_ROW_TOGGLE_CLASS}
                                onClick={() => onMarkRead?.(row.id)}
                              >
                                Mark read
                              </Button>
                            ) : null}
                            {extra}
                          </div>
                        ) : (
                          <span className="text-xs text-muted/70">—</span>
                        )}
                      </td>
                    ) : null}
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
