"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_DETAIL_BTN,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_TD,
  PortalTableDetailActions,
} from "@/components/portal/portal-data-table";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { TabItem } from "@/components/ui/tabs";

/** Same chrome as other portal data tables */
export const PORTAL_INBOX_TABLE_WRAP = PORTAL_DATA_TABLE_WRAP;

export const PORTAL_INBOX_EMPTY_WRAP =
  "flex flex-col items-center justify-center rounded-2xl border border-slate-200/90 bg-slate-50/30 px-4 py-16 text-center sm:py-20";

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

export function PortalInboxEmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className={PORTAL_INBOX_EMPTY_WRAP}>
      <AxisHeaderMarkTile>
        <InboxEmptyIcon className="h-[26px] w-[26px]" />
      </AxisHeaderMarkTile>
      <p className="mt-4 text-sm font-medium text-slate-500">{title}</p>
      {hint ? <div className="mt-2 text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

export const INBOX_TAB_DEFS = [
  { id: "unopened", label: "Unopened" },
  { id: "opened", label: "Opened" },
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
      setTo("");
      setSubject("");
      setBody("");
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
          <label className="text-xs font-semibold text-slate-600" htmlFor="inbox-compose-to">
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
          <label className="text-xs font-semibold text-slate-600" htmlFor="inbox-compose-subject">
            Subject
          </label>
          <Input id="inbox-compose-subject" className="mt-1.5" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600" htmlFor="inbox-compose-body">
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
  expandedId,
  onToggleExpand,
  renderExtraActions,
}: {
  rows: PortalInboxTableRow[];
  onMarkRead?: (id: string) => void;
  /** Full message body shown in an expandable row (Details). */
  getDetailBody?: (row: PortalInboxTableRow) => string | undefined;
  expandedId?: string | null;
  onToggleExpand?: (id: string) => void;
  /** Trash, restore, delete — shown after Mark read when present. */
  renderExtraActions?: (row: PortalInboxTableRow) => ReactNode;
}) {
  const { showToast } = useAppUi();
  return (
    <div className={PORTAL_INBOX_TABLE_WRAP}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className={PORTAL_TABLE_HEAD_ROW}>
              <th className={`${MANAGER_TABLE_TH} text-left`}>From</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Topic</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Preview</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>When</th>
              <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const detail = getDetailBody?.(row);
              const showDetails = Boolean(detail && onToggleExpand);
              const hasMarkRead = Boolean(!row.read && onMarkRead);
              const extra = renderExtraActions?.(row);
              const hasActionCell = hasMarkRead || showDetails || extra;

              return (
                <Fragment key={row.id}>
                  <tr className={PORTAL_TABLE_TR}>
                    <td className={`${PORTAL_TABLE_TD} align-middle`}>
                      <p className="font-medium text-slate-900">{row.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{row.email}</p>
                    </td>
                    <td className={`${PORTAL_TABLE_TD} align-middle text-slate-800`}>{row.topic}</td>
                    <td className={`max-w-[220px] ${PORTAL_TABLE_TD} align-middle text-slate-600`}>
                      <span className="line-clamp-2">{row.preview}</span>
                    </td>
                    <td className={`${PORTAL_TABLE_TD} align-middle text-slate-500`}>{row.whenLabel}</td>
                    <td className={`${PORTAL_TABLE_TD} text-right align-middle`}>
                      {hasActionCell ? (
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
                          {showDetails ? (
                            <Button
                              type="button"
                              variant="outline"
                              className={PORTAL_TABLE_ROW_TOGGLE_CLASS}
                              onClick={() => onToggleExpand?.(row.id)}
                            >
                              {expandedId === row.id ? "Hide" : "Details"}
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                  {expandedId === row.id && detail ? (
                    <tr className={PORTAL_TABLE_DETAIL_ROW}>
                      <td colSpan={5} className={`${PORTAL_TABLE_DETAIL_CELL} text-left`}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Message</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{detail}</p>
                        <PortalTableDetailActions>
                          <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => showToast("Reply (demo).")}>
                            Reply
                          </Button>
                        </PortalTableDetailActions>
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
}
