"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ManagerSectionShell } from "@/components/portal/manager-section-shell";
import {
  inboxTabItems,
  PORTAL_INBOX_TABLE_WRAP,
  PortalInboxEmptyState,
} from "@/components/portal/portal-inbox-ui";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { TabNav } from "@/components/ui/tabs";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";
import {
  ADMIN_INBOX_DEMO_MANAGERS,
  ADMIN_INBOX_DEMO_RESIDENTS,
  appendThreadReply,
  composeAdminOutboundMessage,
  markInboxMessageRead,
  moveInboxMessageToTrash,
  permanentlyDeleteInboxMessage,
  readInboxMessages,
  restoreInboxMessageFromTrash,
  roleAllowsThread,
  type InboxMessage,
} from "@/lib/demo-admin-partner-inbox";

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function previewSnippet(text: string, max = 100) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

type Audience = "manager" | "resident" | "all";

function ComposeModal({
  open,
  onClose,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const { showToast } = useAppUi();
  const [audience, setAudience] = useState<Audience>("manager");
  const [managerId, setManagerId] = useState<string>(ADMIN_INBOX_DEMO_MANAGERS[0]!.id);
  const [residentId, setResidentId] = useState<string>(ADMIN_INBOX_DEMO_RESIDENTS[0]!.id);
  const [topic, setTopic] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTopic("");
    setBody("");
    setAudience("manager");
    setManagerId(ADMIN_INBOX_DEMO_MANAGERS[0]!.id);
    setResidentId(ADMIN_INBOX_DEMO_RESIDENTS[0]!.id);
  }, [open]);

  if (!open) return null;

  const submit = () => {
    setBusy(true);
    try {
      const row = composeAdminOutboundMessage({
        audience,
        recipientId: audience === "manager" ? managerId : audience === "resident" ? residentId : null,
        topic,
        body,
      });
      if (!row) {
        showToast("Add a subject and message.");
        return;
      }
      showToast("Message sent. It appears under Sent.");
      onSent();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-[1px]"
        aria-label="Close compose"
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-[min(100%-1.5rem,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.35)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-inbox-compose-title"
      >
        <h2 id="admin-inbox-compose-title" className="text-lg font-semibold text-slate-900">
          New message
        </h2>
        <p className="mt-1 text-sm text-slate-500">Choose recipients and send an internal message (demo).</p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Send to</label>
            <Select
              className="mt-1.5"
              value={audience}
              onChange={(e) => setAudience(e.target.value as Audience)}
              aria-label="Recipient type"
            >
              <option value="manager">Manager</option>
              <option value="resident">Resident</option>
              <option value="all">All managers & residents</option>
            </Select>
          </div>

          {audience === "manager" ? (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Which manager</label>
              <Select
                className="mt-1.5"
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                aria-label="Select manager"
              >
                {ADMIN_INBOX_DEMO_MANAGERS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {audience === "resident" ? (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Which resident</label>
              <Select
                className="mt-1.5"
                value={residentId}
                onChange={(e) => setResidentId(e.target.value)}
                aria-label="Select resident"
              >
                {ADMIN_INBOX_DEMO_RESIDENTS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Subject</label>
            <Input className="mt-1.5" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Subject" />
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Message</label>
            <Textarea
              className="mt-1.5 min-h-[140px]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message…"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" className="rounded-full" onClick={() => void submit()} disabled={busy}>
            {busy ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </>
  );
}

export function AdminInboxClient({ tabId }: { tabId: string }) {
  const { showToast } = useAppUi();
  const [tick, setTick] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
    showToast("Refreshed inbox.");
  }, [showToast]);

  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener(ADMIN_UI_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(ADMIN_UI_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const all = useMemo(() => readInboxMessages(), [tick]);

  const rows = useMemo(() => {
    if (tabId === "unopened") return all.filter((m) => m.folder === "inbox" && !m.read);
    if (tabId === "opened") return all.filter((m) => m.folder === "inbox" && m.read);
    if (tabId === "sent") return all.filter((m) => m.folder === "sent");
    if (tabId === "trash") return all.filter((m) => m.folder === "trash");
    return [] as InboxMessage[];
  }, [all, tabId]);

  useEffect(() => {
    if (expandedId && !rows.some((r) => r.id === expandedId)) {
      setExpandedId(null);
    }
  }, [rows, expandedId]);

  useEffect(() => {
    setReplyDraft("");
  }, [expandedId]);

  const toggleDetails = (row: InboxMessage) => {
    const opening = expandedId !== row.id;
    setExpandedId(opening ? row.id : null);
    if (opening && row.folder === "inbox" && !row.read) {
      if (markInboxMessageRead(row.id)) setTick((t) => t + 1);
    }
  };

  const shellActions = [
    {
      label: "New message",
      variant: "primary" as const,
      onClick: () => setComposeOpen(true),
    },
    { label: "Refresh", variant: "outline" as const, onClick: refresh },
  ];

  const emptyCopy =
    tabId === "sent"
      ? "No sent messages yet"
      : tabId === "trash"
        ? "Trash is empty"
        : tabId === "opened" && rows.length === 0
          ? "No opened messages yet"
          : "No messages yet";

  const tabs = inboxTabItems("/admin");
  const fromOrToHeader = tabId === "sent" ? "To" : "From";

  const expanded = expandedId ? rows.find((r) => r.id === expandedId) : null;
  const canReply =
    expanded &&
    expanded.folder !== "trash" &&
    roleAllowsThread(expanded.senderRole) &&
    (expanded.folder === "inbox" || expanded.folder === "sent");

  return (
    <ManagerSectionShell title="Inbox" actions={shellActions}>
      <div className="space-y-5">
        <TabNav items={tabs} activeId={tabId} />

        <ComposeModal
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          onSent={() => setTick((t) => t + 1)}
        />

        {rows.length === 0 ? (
          <PortalInboxEmptyState
            title={emptyCopy}
            hint={
              tabId === "unopened" ? (
                <p className="max-w-md">Partner inquiries from the public site and portal mail appear here.</p>
              ) : undefined
            }
          />
        ) : (
          <div className={PORTAL_INBOX_TABLE_WRAP}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200/90 bg-white">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      {fromOrToHeader}
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Topic</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Preview</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">When</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isOpen = expandedId === row.id;
                    const primaryName =
                      tabId === "sent" ? row.composeRecipientLabel ?? row.name : row.name;
                    const primaryEmail = tabId === "sent" && row.composeAudience === "all" ? "" : row.email;
                    return (
                      <Fragment key={row.id}>
                        <tr className={`border-b border-slate-100 ${isOpen ? "bg-slate-50/40" : ""}`}>
                          <td className="px-5 py-4 align-middle">
                            <p className="font-semibold text-slate-900">{primaryName}</p>
                            {primaryEmail ? <p className="mt-0.5 text-sm text-slate-500">{primaryEmail}</p> : null}
                          </td>
                          <td className="px-5 py-4 align-middle text-sm text-slate-800">{row.topic}</td>
                          <td className="max-w-[220px] px-5 py-4 align-middle text-sm text-slate-600">
                            <span className="line-clamp-2">{previewSnippet(row.body)}</span>
                          </td>
                          <td className="px-5 py-4 align-middle text-sm text-slate-500">{formatWhen(row.createdAt)}</td>
                          <td className="px-5 py-4 text-right align-middle">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-full border-slate-200 px-3 py-2 text-sm font-medium text-slate-800"
                                onClick={() => toggleDetails(row)}
                              >
                                {isOpen ? "Hide" : "Details"}
                              </Button>
                              {tabId === "trash" ? (
                                <>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-full border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
                                    onClick={() => {
                                      if (restoreInboxMessageFromTrash(row.id)) {
                                        showToast("Restored.");
                                        setExpandedId(null);
                                        setTick((t) => t + 1);
                                      }
                                    }}
                                  >
                                    Restore
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-full border-rose-200 px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-50"
                                    onClick={() => {
                                      if (permanentlyDeleteInboxMessage(row.id)) {
                                        showToast("Deleted permanently.");
                                        setExpandedId(null);
                                        setTick((t) => t + 1);
                                      }
                                    }}
                                  >
                                    Delete forever
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-full border-slate-200 px-3 py-2 text-sm font-medium text-slate-800"
                                  onClick={() => {
                                    if (moveInboxMessageToTrash(row.id)) {
                                      showToast("Moved to trash.");
                                      setExpandedId(null);
                                      setTick((t) => t + 1);
                                    }
                                  }}
                                >
                                  Move to trash
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isOpen ? (
                          <tr className="border-b border-slate-100 bg-slate-50/70">
                            <td colSpan={5} className="px-5 py-5">
                              <div className="space-y-4 text-left">
                                <div>
                                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Message</p>
                                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{row.body}</p>
                                </div>

                                {row.thread.length > 0 ? (
                                  <div>
                                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                                      Thread
                                    </p>
                                    <ul className="mt-2 space-y-3">
                                      {row.thread.map((t) => (
                                        <li
                                          key={t.id}
                                          className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-sm shadow-sm"
                                        >
                                          <p className="font-semibold text-slate-900">{t.authorLabel}</p>
                                          <p className="mt-0.5 text-xs text-slate-500">{formatWhen(t.createdAt)}</p>
                                          <p className="mt-2 whitespace-pre-wrap text-slate-700">{t.body}</p>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}

                                {canReply && expanded?.id === row.id ? (
                                  <div>
                                    <label
                                      htmlFor={`reply-${row.id}`}
                                      className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400"
                                    >
                                      Add to thread
                                    </label>
                                    <Textarea
                                      id={`reply-${row.id}`}
                                      className="mt-2 min-h-[100px]"
                                      value={replyDraft}
                                      onChange={(e) => setReplyDraft(e.target.value)}
                                      placeholder="Write a reply…"
                                    />
                                    <Button
                                      type="button"
                                      className="mt-2 rounded-full"
                                      onClick={() => {
                                        const text = replyDraft.trim();
                                        if (!text) {
                                          showToast("Enter a reply.");
                                          return;
                                        }
                                        if (appendThreadReply(row.id, "Axis Admin", text)) {
                                          showToast("Added to thread.");
                                          setReplyDraft("");
                                          setTick((t) => t + 1);
                                        } else showToast("Could not add reply.");
                                      }}
                                    >
                                      Add to thread
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
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
        )}
      </div>
    </ManagerSectionShell>
  );
}
