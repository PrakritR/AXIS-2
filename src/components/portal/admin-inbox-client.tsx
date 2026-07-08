"use client";

import { useEffect, useMemo, useState } from "react";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import {
  INBOX_TAB_DEFS,
  PortalInboxEmptyState,
  PortalInboxMessageTable,
  type PortalInboxTableRow,
} from "@/components/portal/portal-inbox-ui";
import { ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import { PORTAL_DETAIL_BTN } from "@/components/portal/portal-data-table";
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
import { isDemoModeActive } from "@/lib/demo/demo-session";

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

function toAdminTableRows(list: InboxMessage[], tabId: string): PortalInboxTableRow[] {
  return list.map((row) => ({
    id: row.id,
    name: tabId === "sent" ? row.composeRecipientLabel ?? row.name : row.name,
    email:
      tabId === "sent" &&
      (row.composeAudience === "all" ||
        row.composeAudience === "all_managers" ||
        row.composeAudience === "all_residents")
        ? ""
        : row.email,
    subject: row.topic,
    whenLabel: formatWhen(row.createdAt),
    read: row.read,
  }));
}

// Admin inbox has no scheduled-messages backend, so the shared "schedule" tab
// (manager-only) must not render here — its route would 404 under /admin.
const ADMIN_INBOX_TAB_DEFS = INBOX_TAB_DEFS.filter((t) => t.id !== "schedule");

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

        <div className="mt-5 flex flex-wrap justify-start gap-2">
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
  const navigate = usePortalNavigate();
  const [tick, setTick] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  // Messages marked read while viewing "Unopened" stay listed here until the tab
  // is switched or the page is refreshed; they only move to "Opened" on reset.
  const [retainedIds, setRetainedIds] = useState<Set<string>>(() => new Set());
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
    if (isDemoModeActive()) return;
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
    if (tabId === "unopened")
      return all.filter((m) => m.folder === "inbox" && (!m.read || retainedIds.has(m.id)));
    if (tabId === "opened") return all.filter((m) => m.folder === "inbox" && m.read);
    if (tabId === "sent") return all.filter((m) => m.folder === "sent");
    if (tabId === "trash") return all.filter((m) => m.folder === "trash");
    return [] as InboxMessage[];
  }, [all, tabId, retainedIds]);

  // Reset the "keep read messages listed" retention whenever the tab changes,
  // so returning to Unopened (or refreshing) shows the true unread set.
  useEffect(() => {
    setRetainedIds(new Set());
  }, [tabId]);

  const folderCounts = useMemo(() => {
    return {
      unopened: all.filter((m) => m.folder === "inbox" && !m.read).length,
      opened: all.filter((m) => m.folder === "inbox" && m.read).length,
      sent: all.filter((m) => m.folder === "sent").length,
      trash: all.filter((m) => m.folder === "trash").length,
    };
  }, [all]);

  const inboxTabs = useMemo(
    () => ADMIN_INBOX_TAB_DEFS.map(({ id, label }) => ({ id, label, count: folderCounts[id as keyof typeof folderCounts] })),
    [folderCounts],
  );

  useEffect(() => {
    if (expandedId && !rows.some((r) => r.id === expandedId)) {
      queueMicrotask(() => setExpandedId(null));
    }
  }, [rows, expandedId]);

  const tableRows = useMemo(() => toAdminTableRows(rows, tabId), [rows, tabId]);

  // Opening a message no longer marks it read — reading keeps it in Unopened.
  const toggleExpand = (id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
  };

  const markRead = (id: string) => {
    if (markInboxMessageRead(id)) {
      setRetainedIds((prev) => new Set(prev).add(id));
      setTick((t) => t + 1);
    }
  };

  const emptyCopy =
    tabId === "sent"
      ? "No sent messages yet."
      : tabId === "trash"
        ? "No trash messages yet."
        : tabId === "opened" && rows.length === 0
          ? "No opened messages yet."
          : "No messages yet.";

  const fromOrToHeader = tabId === "sent" ? "To" : "From";

  const bodyById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const row of rows) m[row.id] = row.body;
    return m;
  }, [rows]);

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
              className="shrink-0 rounded-full border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)]"
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
          onChange={(id) => navigate(`/admin/inbox/${id}`)}
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
          <PortalInboxEmptyState title={emptyCopy} />
        ) : (
          <PortalInboxMessageTable
            rows={tableRows}
            primaryPartyHeader={fromOrToHeader}
            onMarkRead={tabId === "unopened" ? markRead : undefined}
            getDetailBody={(row) => bodyById[row.id]}
            getThreadMessages={(row) => {
              const message = rows.find((r) => r.id === row.id);
              if (!message) return [];
              return [
                {
                  id: `${message.id}-root`,
                  from: message.name,
                  body: message.body,
                  at: formatWhen(message.createdAt),
                },
                ...message.thread.map((t) => ({
                  id: t.id,
                  from: t.authorLabel,
                  body: t.body,
                  at: formatWhen(t.createdAt),
                })),
              ];
            }}
            onReply={
              tabId === "trash"
                ? undefined
                : (row, text) => {
                    const message = rows.find((r) => r.id === row.id);
                    if (!message) return;
                    if (!roleAllowsThread(message.senderRole)) return;
                    if (message.folder !== "inbox" && message.folder !== "sent") return;
                    if (appendThreadReply(row.id, "Axis Admin", text)) {
                      showToast("Added to thread.");
                      setTick((t) => t + 1);
                    } else {
                      showToast("Could not add reply.");
                    }
                  }
            }
            expandedId={expandedId}
            onToggleExpand={toggleExpand}
            renderExtraActions={(row) => {
              if (tabId === "trash") {
                return (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className={PORTAL_DETAIL_BTN}
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
                      className={`${PORTAL_DETAIL_BTN} !border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)]`}
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
                );
              }
              return (
                <Button
                  type="button"
                  variant="outline"
                  className={PORTAL_DETAIL_BTN}
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
              );
            }}
          />
        )}
      </div>
    </ManagerPortalPageShell>
  );
}
