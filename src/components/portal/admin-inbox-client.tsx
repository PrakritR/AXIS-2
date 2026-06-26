"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  INBOX_TAB_DEFS,
  PORTAL_INBOX_TABLE_WRAP,
  PortalInboxEmptyState,
} from "@/components/portal/portal-inbox-ui";
import {
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_TD,
} from "@/components/portal/portal-data-table";
import { MANAGER_TABLE_TH, ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";
import {
  appendInboxMessage,
  appendThreadReply,
  emptyAdminInboxTrash,
  markInboxMessageRead,
  moveInboxMessageToTrash,
  permanentlyDeleteInboxMessage,
  readInboxMessages,
  restoreInboxMessageFromTrash,
  roleAllowsThread,
  syncInboxMessagesFromServer,
  type AdminComposeSendMode,
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

const ADMIN_COMPOSE_MODE_OPTIONS: { value: AdminComposeSendMode; label: string }[] = [
  { value: "all_portal", label: "Everyone (managers & residents)" },
  { value: "all_managers", label: "All managers" },
  { value: "all_residents", label: "All residents" },
  { value: "pick_managers", label: "Choose managers…" },
  { value: "pick_residents", label: "Choose residents…" },
];

type Recipient = { id: string; name: string; email: string };

function ComposeModal({
  open,
  onClose,
  onSent,
  recipients,
}: {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  recipients: { managers: Recipient[]; residents: Recipient[] };
}) {
  const { showToast } = useAppUi();
  const [mode, setMode] = useState<AdminComposeSendMode>("pick_managers");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [topic, setTopic] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const pickPool = useMemo(() => {
    if (mode === "pick_managers") return recipients.managers;
    if (mode === "pick_residents") return recipients.residents;
    return [] as Recipient[];
  }, [mode, recipients]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setTopic("");
      setBody("");
      setMode("pick_managers");
      const first = recipients.managers[0]?.id;
      setSelectedIds(first ? new Set([first]) : new Set());
    });
  }, [open, recipients.managers]);

  if (!open) return null;

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pickHeading =
    mode === "pick_managers" ? "Which managers" : mode === "pick_residents" ? "Which residents" : null;

  const submit = () => {
    setBusy(true);
    try {
      const isPick = mode.startsWith("pick");
      if (isPick && selectedIds.size === 0) {
        showToast("Select at least one recipient.");
        return;
      }

      const topicTrim = topic.trim();
      const bodyTrim = body.trim();
      if (!topicTrim || !bodyTrim) {
        showToast("Add a subject and message.");
        return;
      }

      let toUserIds: string[] = [];

      if (mode === "all_portal" || mode === "all_managers" || mode === "all_residents") {
        const label =
          mode === "all_portal"
            ? "All managers & residents"
            : mode === "all_managers"
              ? "All managers"
              : "All residents";
        const emailStub =
          mode === "all_portal"
            ? "all-portal@axis.local"
            : mode === "all_managers"
              ? "all-managers@axis.local"
              : "all-residents@axis.local";
        appendInboxMessage({
          name: "Broadcast",
          email: emailStub,
          topic: topicTrim,
          body: bodyTrim,
          folder: "sent",
          senderRole: "admin",
          composeAudience: mode === "all_portal" ? "all" : mode,
          composeRecipientLabel: label,
        });
        toUserIds =
          mode === "all_portal"
            ? [...recipients.managers, ...recipients.residents].map((p) => p.id)
            : mode === "all_managers"
              ? recipients.managers.map((p) => p.id)
              : recipients.residents.map((p) => p.id);
      } else {
        const pool = mode === "pick_managers" ? recipients.managers : recipients.residents;
        const picked = pool.filter((p) => selectedIds.has(p.id));
        if (picked.length === 0) {
          showToast("Select at least one recipient.");
          return;
        }
        const roleLabel = mode === "pick_managers" ? "Manager" : "Resident";
        appendInboxMessage({
          name: picked.length === 1 ? picked[0]!.name : `${picked.length} recipients`,
          email: picked.map((p) => p.email).filter(Boolean).join("; "),
          topic: topicTrim,
          body: bodyTrim,
          folder: "sent",
          senderRole: "admin",
          composeAudience: picked.length > 1 ? "multi" : mode === "pick_managers" ? "manager" : "resident",
          composeRecipientLabel:
            picked.length === 1
              ? `${picked[0]!.name} (${roleLabel})`
              : `${picked.length} ${roleLabel.toLowerCase()}s (${picked.map((p) => p.name).join(", ")})`,
        });
        toUserIds = picked.map((p) => p.id);
      }

      // Deliver to each recipient's real portal inbox (admin's own "Sent" record above is separate).
      if (toUserIds.length > 0) {
        void fetch("/api/portal/send-inbox-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            fromName: "Axis Admin",
            toUserIds,
            subject: topicTrim,
            text: bodyTrim,
            deliverViaEmail: false,
          }),
        }).catch(() => undefined);
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
        className="fixed inset-0 z-40 modal-overlay"
        aria-label="Close compose"
        onClick={onClose}
      />
      <div
        className="modal-panel fixed left-1/2 top-1/2 z-50 w-[min(100%-1.5rem,28rem)] max-h-[min(100%-2rem,90vh)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border p-5 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.35)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-inbox-compose-title"
      >
        <h2 id="admin-inbox-compose-title" className="text-lg font-semibold text-foreground">
          New message
        </h2>
        <p className="mt-1 text-sm text-muted">Broadcast to a group or choose specific managers or residents.</p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Send to</label>
            <Select
              className="mt-1.5"
              value={mode}
              onChange={(e) => {
                const v = e.target.value as AdminComposeSendMode;
                setMode(v);
                if (v === "pick_managers") {
                  const first = recipients.managers[0]?.id;
                  setSelectedIds(first ? new Set([first]) : new Set());
                } else if (v === "pick_residents") {
                  const first = recipients.residents[0]?.id;
                  setSelectedIds(first ? new Set([first]) : new Set());
                } else {
                  setSelectedIds(new Set());
                }
              }}
              aria-label="Recipient type"
            >
              {ADMIN_COMPOSE_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>

          {pickHeading && pickPool.length > 0 ? (
            <div className="rounded-xl border border-border bg-accent/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{pickHeading}</span>
                <button
                  type="button"
                  className="text-xs font-semibold text-primary hover:underline"
                  onClick={() => setSelectedIds(new Set(pickPool.map((p) => p.id)))}
                >
                  Select all
                </button>
              </div>
              <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto pr-1">
                {pickPool.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-card px-2 py-2 text-sm ring-1 ring-border hover:bg-accent/30">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 rounded border-border"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleId(c.id)}
                      />
                      <span>
                        <span className="font-medium text-foreground">{c.name}</span>
                        <span className="mt-0.5 block text-xs text-muted">{c.email}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Subject</label>
            <Input className="mt-1.5" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Subject" />
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Message</label>
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
  const router = useRouter();
  const [tick, setTick] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [recipients, setRecipients] = useState<{ managers: Recipient[]; residents: Recipient[] }>({
    managers: [],
    residents: [],
  });

  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener(ADMIN_UI_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(ADMIN_UI_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  useEffect(() => {
    void syncInboxMessagesFromServer().then(() => setTick((t) => t + 1));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/portal-users", { credentials: "include" });
        const body = (await res.json()) as {
          managers?: Recipient[];
          residents?: Recipient[];
        };
        if (!res.ok || cancelled) return;
        setRecipients({
          managers: body.managers ?? [],
          residents: body.residents ?? [],
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const all = useMemo(() => {
    void tick;
    return readInboxMessages();
  }, [tick]);

  const rows = useMemo(() => {
    if (tabId === "unopened") return all.filter((m) => m.folder === "inbox" && !m.read);
    if (tabId === "opened") return all.filter((m) => m.folder === "inbox" && m.read);
    if (tabId === "sent") return all.filter((m) => m.folder === "sent");
    if (tabId === "trash") return all.filter((m) => m.folder === "trash");
    return [] as InboxMessage[];
  }, [all, tabId]);

  const folderCounts = useMemo(() => {
    return {
      unopened: all.filter((m) => m.folder === "inbox" && !m.read).length,
      opened: all.filter((m) => m.folder === "inbox" && m.read).length,
      sent: all.filter((m) => m.folder === "sent").length,
      trash: all.filter((m) => m.folder === "trash").length,
    };
  }, [all]);

  const inboxTabs = useMemo(
    () => INBOX_TAB_DEFS.map(({ id, label }) => ({ id, label, count: folderCounts[id as keyof typeof folderCounts] })),
    [folderCounts],
  );

  useEffect(() => {
    if (expandedId && !rows.some((r) => r.id === expandedId)) {
      queueMicrotask(() => setExpandedId(null));
    }
  }, [rows, expandedId]);

  useEffect(() => {
    queueMicrotask(() => setReplyDraft(""));
  }, [expandedId]);

  const toggleDetails = (row: InboxMessage) => {
    const opening = expandedId !== row.id;
    setExpandedId(opening ? row.id : null);
    if (opening && row.folder === "inbox" && !row.read) {
      if (markInboxMessageRead(row.id)) setTick((t) => t + 1);
    }
  };

  const emptyCopy =
    tabId === "sent"
      ? "No sent messages yet"
      : tabId === "trash"
        ? "Trash is empty"
        : tabId === "opened" && rows.length === 0
          ? "No opened messages yet"
          : "No messages yet";

  const fromOrToHeader = tabId === "sent" ? "To" : "From";

  const expanded = expandedId ? rows.find((r) => r.id === expandedId) : null;
  const canReply =
    expanded &&
    expanded.folder !== "trash" &&
    roleAllowsThread(expanded.senderRole) &&
    (expanded.folder === "inbox" || expanded.folder === "sent");

  return (
    <ManagerPortalPageShell
      title="Inbox"
      titleAside={
        <>
          <Button type="button" variant="primary" className="shrink-0 rounded-full" onClick={() => setComposeOpen(true)}>
            New message
          </Button>
          {tabId === "trash" && folderCounts.trash > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="shrink-0 rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
              onClick={() => {
                if (!window.confirm(`Delete all ${folderCounts.trash} trash message${folderCounts.trash === 1 ? "" : "s"}? This cannot be undone.`)) return;
                void emptyAdminInboxTrash().then((ok) => {
                  if (ok) {
                    showToast("Trash cleared.");
                    setExpandedId(null);
                    setTick((t) => t + 1);
                  } else {
                    showToast("Could not clear trash.");
                  }
                });
              }}
            >
              Delete all trash
            </Button>
          ) : null}
        </>
      }
      filterRow={
        <ManagerPortalStatusPills
          activeTone="primary"
          tabs={inboxTabs}
          activeId={tabId}
          onChange={(id) => router.push(`/admin/inbox/${id}`)}
        />
      }
    >
      <div className="space-y-5">
        <ComposeModal
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          onSent={() => setTick((t) => t + 1)}
          recipients={recipients}
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
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className={PORTAL_TABLE_HEAD_ROW}>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>{fromOrToHeader}</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Topic</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Preview</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>When</th>
                    <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isOpen = expandedId === row.id;
                    const primaryName =
                      tabId === "sent" ? row.composeRecipientLabel ?? row.name : row.name;
                    const primaryEmail =
                      tabId === "sent" &&
                      (row.composeAudience === "all" ||
                        row.composeAudience === "all_managers" ||
                        row.composeAudience === "all_residents")
                        ? ""
                        : row.email;
                    return (
                      <Fragment key={row.id}>
                        <tr className={`${PORTAL_TABLE_TR} ${isOpen ? "bg-accent/30/30" : ""}`}>
                          <td className={`${PORTAL_TABLE_TD} align-middle`}>
                            <p className="font-medium text-foreground">{primaryName}</p>
                            {primaryEmail ? <p className="mt-0.5 text-xs text-muted">{primaryEmail}</p> : null}
                          </td>
                          <td className={`${PORTAL_TABLE_TD} align-middle text-foreground`}>{row.topic}</td>
                          <td className={`max-w-[220px] ${PORTAL_TABLE_TD} align-middle text-muted`}>
                            <span className="line-clamp-2">{previewSnippet(row.body)}</span>
                          </td>
                          <td className={`${PORTAL_TABLE_TD} align-middle text-muted`}>{formatWhen(row.createdAt)}</td>
                          <td className={`${PORTAL_TABLE_TD} text-right align-middle`}>
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                className={PORTAL_TABLE_ROW_TOGGLE_CLASS}
                                onClick={() => toggleDetails(row)}
                              >
                                {isOpen ? "Hide" : "Details"}
                              </Button>
                              {tabId === "trash" ? (
                                <>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className={`${PORTAL_TABLE_ROW_TOGGLE_CLASS} !border-emerald-200 text-emerald-900 hover:bg-emerald-50`}
                                    onClick={() => {
                                      void restoreInboxMessageFromTrash(row.id).then((ok) => {
                                        if (ok) {
                                          showToast("Restored.");
                                          setExpandedId(null);
                                          setTick((t) => t + 1);
                                        } else {
                                          showToast("Could not restore message.");
                                        }
                                      });
                                    }}
                                  >
                                    Restore
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className={`${PORTAL_TABLE_ROW_TOGGLE_CLASS} !border-rose-200 text-rose-800 hover:bg-rose-50`}
                                    onClick={() => {
                                      void permanentlyDeleteInboxMessage(row.id).then((ok) => {
                                        if (ok) {
                                          showToast("Deleted permanently.");
                                          setExpandedId(null);
                                          setTick((t) => t + 1);
                                        } else {
                                          showToast("Could not delete message.");
                                        }
                                      });
                                    }}
                                  >
                                    Delete forever
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={PORTAL_TABLE_ROW_TOGGLE_CLASS}
                                  onClick={() => {
                                    void moveInboxMessageToTrash(row.id).then((ok) => {
                                      if (ok) {
                                        showToast("Moved to trash.");
                                        setExpandedId(null);
                                        setTick((t) => t + 1);
                                      } else {
                                        showToast("Could not move message to trash.");
                                      }
                                    });
                                  }}
                                >
                                  Move to trash
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isOpen ? (
                          <tr className={PORTAL_TABLE_DETAIL_ROW}>
                            <td colSpan={5} className={PORTAL_TABLE_DETAIL_CELL}>
                              <div className="space-y-3 text-left">
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Message</p>
                                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{row.body}</p>
                                </div>

                                {row.thread.length > 0 ? (
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                                      Thread
                                    </p>
                                    <ul className="mt-2 space-y-2">
                                      {row.thread.map((t) => (
                                        <li
                                          key={t.id}
                                          className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm"
                                        >
                                          <p className="font-semibold text-foreground">{t.authorLabel}</p>
                                          <p className="mt-0.5 text-xs text-muted">{formatWhen(t.createdAt)}</p>
                                          <p className="mt-2 whitespace-pre-wrap text-muted">{t.body}</p>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}

                                {canReply && expanded?.id === row.id ? (
                                  <div>
                                    <label
                                      htmlFor={`reply-${row.id}`}
                                      className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted"
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
    </ManagerPortalPageShell>
  );
}
