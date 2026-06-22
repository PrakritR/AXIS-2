"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, ManagerPortalStatusPills, PORTAL_HEADER_ACTION_BTN, PORTAL_TOOLBAR_LABEL, PORTAL_TOOLBAR_SELECT } from "@/components/portal/portal-metrics";
import { ScopedInboxComposeModal, type ScopedInboxSendPayload } from "@/components/portal/inbox-scoped-compose-modal";
import { usePaidPortalBasePath } from "@/lib/portal-base-path-client";
import { appendPortalMessageToAdminInbox } from "@/lib/demo-admin-partner-inbox";
import { formatPacificDateTime } from "@/lib/pacific-time";
import {
  MANAGER_INBOX_STORAGE_KEY,
  PORTAL_INBOX_CHANGED_EVENT,
  loadPersistedInbox,
  persistInbox,
  syncPersistedInboxFromServer,
} from "@/lib/portal-inbox-storage";
import { INBOX_TAB_DEFS, PortalInboxEmptyState, PortalInboxMessageTable, type PortalInboxTableRow } from "./portal-inbox-ui";
import { readManagerApplicationRows, MANAGER_APPLICATIONS_EVENT } from "@/lib/manager-applications-storage";
import { readProRelationships } from "@/lib/pro-relationships";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import type { InboxScopedContact } from "@/data/inbox-scoped-directory";

type InboxThread = {
  id: string;
  folder: "inbox" | "sent" | "trash";
  previousFolder?: "inbox" | "sent";
  from: string;
  email: string;
  subject: string;
  preview: string;
  body: string;
  time: string;
  unread: boolean;
};

function previewLine(body: string, max = 100) {
  const t = body.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function toRows(list: InboxThread[], tabId: string): PortalInboxTableRow[] {
  return list.map((t) => ({
    id: t.id,
    name: tabId === "sent" ? (t.email || "Unknown recipient") : t.from,
    email: tabId === "sent" ? (t.from ? `From ${t.from}` : "") : t.email,
    topic: t.subject,
    preview: t.preview,
    whenLabel: t.time,
    read: !t.unread,
  }));
}

function countThreads(threads: InboxThread[]) {
  return {
    unopened: threads.filter((t) => t.folder === "inbox" && t.unread).length,
    opened: threads.filter((t) => t.folder === "inbox" && !t.unread).length,
    sent: threads.filter((t) => t.folder === "sent").length,
    trash: threads.filter((t) => t.folder === "trash").length,
  };
}

export function ManagerInbox({ tabId }: { tabId: string }) {
  const { showToast } = useAppUi();
  const router = useRouter();
  const portalBase = usePaidPortalBasePath();
  const { userId } = useManagerUserId();
  const [local, setLocal] = useState<InboxThread[]>(() => loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []) as InboxThread[]);
  const [persistReady] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [contactTick, setContactTick] = useState(0);

  useEffect(() => {
    void syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY).then((rows) => setLocal(rows as InboxThread[]));
  }, []);

  useEffect(() => {
    const bump = () => setContactTick((n) => n + 1);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, bump);
    window.addEventListener("axis-pro-relationships", bump);
    return () => {
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, bump);
      window.removeEventListener("axis-pro-relationships", bump);
    };
  }, []);

  const liveContacts = useMemo((): InboxScopedContact[] => {
    void contactTick;
    const out: InboxScopedContact[] = [];
    const seen = new Set<string>();
    // Approved residents
    for (const row of readManagerApplicationRows()) {
      if (row.bucket !== "approved" || !row.email?.trim()) continue;
      const email = row.email.trim().toLowerCase();
      if (seen.has(email)) continue;
      seen.add(email);
      out.push({ id: `res-${row.id}`, name: row.name || email, email: row.email.trim(), role: "resident" });
    }
    // Linked accounts
    if (userId) {
      for (const rel of readProRelationships(userId)) {
        const email = rel.linkedAxisId.trim();
        if (!email || seen.has(email.toLowerCase())) continue;
        seen.add(email.toLowerCase());
        out.push({ id: `rel-${rel.id}`, name: rel.linkedDisplayName || rel.linkedAxisId, email: rel.linkedAxisId, role: "manager" });
      }
    }
    return out;
  }, [userId, contactTick]);

  useEffect(() => {
    const sync = (evt?: Event) => {
      if (evt && evt.type === PORTAL_INBOX_CHANGED_EVENT) {
        const ce = evt as CustomEvent<{ key?: string }>;
        if (ce.detail?.key && ce.detail.key !== MANAGER_INBOX_STORAGE_KEY) return;
      }
      setLocal(loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []) as InboxThread[]);
    };
    window.addEventListener(PORTAL_INBOX_CHANGED_EVENT, sync as EventListener);
    return () => {
      window.removeEventListener(PORTAL_INBOX_CHANGED_EVENT, sync as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!persistReady) return;
    persistInbox(MANAGER_INBOX_STORAGE_KEY, local);
  }, [local, persistReady]);

  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "sender" | "subject">("newest");

  const counts = useMemo(() => countThreads(local), [local]);
  const tabs = useMemo(
    () => INBOX_TAB_DEFS.map(({ id, label }) => ({ id, label, count: counts[id as keyof typeof counts] })),
    [counts],
  );

  function threadTimestamp(t: InboxThread): number {
    const match = t.id.match(/(\d{10,})/);
    return match ? parseInt(match[1]!, 10) : 0;
  }

  const rowsForTab = useMemo(() => {
    let filtered: InboxThread[];
    if (tabId === "unopened") filtered = local.filter((t) => t.folder === "inbox" && t.unread);
    else if (tabId === "opened") filtered = local.filter((t) => t.folder === "inbox" && !t.unread);
    else if (tabId === "sent") filtered = local.filter((t) => t.folder === "sent");
    else if (tabId === "trash") filtered = local.filter((t) => t.folder === "trash");
    else filtered = [];

    return [...filtered].sort((a, b) => {
      if (sortBy === "newest") return threadTimestamp(b) - threadTimestamp(a);
      if (sortBy === "oldest") return threadTimestamp(a) - threadTimestamp(b);
      if (sortBy === "sender") return a.from.localeCompare(b.from, undefined, { sensitivity: "base" });
      if (sortBy === "subject") return a.subject.localeCompare(b.subject, undefined, { sensitivity: "base" });
      return 0;
    });
  }, [local, tabId, sortBy]);

  const markRead = (id: string) => {
    setLocal((prev) => prev.map((t) => (t.id === id && t.folder === "inbox" ? { ...t, unread: false } : t)));
    setExpandedId((e) => (e === id ? null : e));
    showToast("Marked as read.");
  };

  const bodyById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of local) m[t.id] = t.body;
    return m;
  }, [local]);

  const moveToTrash = (id: string) => {
    setLocal((prev) =>
      prev.map((t) =>
        t.id === id && (t.folder === "inbox" || t.folder === "sent")
          ? { ...t, folder: "trash" as const, previousFolder: t.folder, unread: false }
          : t,
      ),
    );
    setExpandedId((e) => (e === id ? null : e));
    showToast("Moved to trash.");
  };

  function inferPreviousFolder(t: InboxThread): "inbox" | "sent" {
    if (t.previousFolder) return t.previousFolder;
    if (/^(sent_|msg_|welcome_)/.test(t.id)) return "sent";
    return "inbox";
  }

  const restoreFromTrash = (id: string) => {
    setLocal((prev) =>
      prev.map((t) => {
        if (t.id !== id || t.folder !== "trash") return t;
        const dest = inferPreviousFolder(t);
        return { ...t, folder: dest, previousFolder: undefined, unread: false };
      }),
    );
    setExpandedId((e) => (e === id ? null : e));
    showToast("Restored.");
  };

  const deleteForever = (id: string) => {
    setLocal((prev) => prev.filter((t) => t.id !== id));
    setExpandedId((e) => (e === id ? null : e));
    showToast("Message deleted.");
    void fetch("/api/portal-inbox-threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "delete", id }),
    }).catch(() => undefined);
  };

  const deleteAllTrash = () => {
    const trashItems = local.filter((t) => t.folder === "trash");
    if (trashItems.length === 0) {
      showToast("Trash is already empty.");
      return;
    }
    if (!window.confirm(`Delete all ${trashItems.length} trash message${trashItems.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    void (async () => {
      const ids = trashItems.map((item) => item.id).filter(Boolean);
      if (ids.length === 0) return;
      await fetch("/api/portal-inbox-threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "deleteIds", ids }),
      });
      setLocal((prev) => prev.filter((t) => t.folder !== "trash"));
      setExpandedId(null);
      showToast("Trash cleared.");
      await syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY, { force: true }).then((rows) => {
        setLocal(rows as InboxThread[]);
      });
    })().catch(() => showToast("Could not clear trash."));
  };

  const toggleExpand = (id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
  };

  const handleComposeSend = useCallback(
    (p: ScopedInboxSendPayload) => {
      const when = formatPacificDateTime(new Date());
      if (p.includesAxisAdmin) {
        appendPortalMessageToAdminInbox({
          role: "manager",
          name: p.senderName,
          email: p.senderEmail,
          topic: p.subject.trim(),
          body: p.body.trim(),
        });
      }
      const id = `sent_${Date.now()}`;
      const row: InboxThread = {
        id,
        folder: "sent",
        from: "You",
        email: p.toEmailLine,
        subject: p.subject.trim(),
        preview: previewLine(p.body),
        body: p.body.trim(),
        time: when,
        unread: false,
      };
      setLocal((prev) => [row, ...prev]);
      setComposeOpen(false);

      // Fire-and-forget real email/SMS delivery
      void fetch("/api/portal/send-inbox-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fromName: p.senderName,
          fromEmail: p.senderEmail,
          toEmails: p.directRecipientEmailLine.split(";").map((e) => e.trim()).filter(Boolean),
          toBroadcast: p.broadcastCategories,
          subject: p.subject.trim(),
          text: p.body.trim(),
          deliverViaEmail: p.deliverViaEmail,
          deliverViaSms: p.deliverViaSms,
        }),
      }).catch(() => undefined);

      showToast(
        p.includesAxisAdmin && !p.includesDirectoryRecipients
          ? "Message sent to Axis Housing admin."
          : "Message sent.",
      );
      router.push(`${portalBase}/inbox/sent`);
    },
    [router, showToast, portalBase],
  );

  const refreshInbox = () => {
    void syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY, { force: true }).then((rows) => {
      setLocal(rows as InboxThread[]);
      showToast("Inbox refreshed.");
    });
  };

  const emptyCopy =
    tabId === "sent" && rowsForTab.length === 0
      ? "No sent messages yet"
      : tabId === "trash" && rowsForTab.length === 0
        ? "Trash is empty"
        : tabId === "opened" && rowsForTab.length === 0
          ? "No opened messages yet"
          : tabId === "unopened" && rowsForTab.length === 0
            ? "No unopened messages"
            : "No messages yet";

  return (
    <ManagerPortalPageShell
      title="Inbox"
      titleAside={
        <>
          {tabId === "trash" ? (
            <Button
              type="button"
              variant="outline"
              className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN} border-rose-200 text-rose-800 hover:bg-rose-50`}
              onClick={deleteAllTrash}
            >
              Delete all trash
            </Button>
          ) : null}
          <Button type="button" variant="primary" className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`} onClick={() => setComposeOpen(true)}>
            New message
          </Button>
          <Button type="button" variant="outline" className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`} onClick={refreshInbox}>
            Refresh
          </Button>
        </>
      }
      filterRow={
        <div className="flex flex-wrap items-center gap-3">
          <ManagerPortalStatusPills
            activeTone="primary"
            tabs={tabs}
            activeId={tabId}
            onChange={(id) => router.push(`${portalBase}/inbox/${id}`)}
          />
          <label className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-slate-100/70 p-1 pr-1.5">
            <span className={`${PORTAL_TOOLBAR_LABEL} pl-2`}>Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className={`${PORTAL_TOOLBAR_SELECT} h-8 px-3 text-xs`}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="sender">Sender A–Z</option>
              <option value="subject">Subject A–Z</option>
            </select>
          </label>
        </div>
      }
    >
      <ScopedInboxComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSend={handleComposeSend}
        portal="manager"
        senderName="Property manager"
        senderEmail="manager@example.com"
        liveContacts={liveContacts}
      />

      {rowsForTab.length === 0 ? (
        <PortalInboxEmptyState
          title={emptyCopy}
          hint={
            tabId === "unopened" ? (
              <p className="max-w-md">Messages from applicants, residents, and vendors appear here.</p>
            ) : undefined
          }
        />
      ) : (
        <PortalInboxMessageTable
          rows={toRows(rowsForTab, tabId)}
          primaryPartyHeader={tabId === "sent" ? "To" : "From"}
          onMarkRead={tabId === "unopened" ? markRead : undefined}
          getDetailBody={(row) => bodyById[row.id]}
          expandedId={expandedId}
          onToggleExpand={toggleExpand}
          renderExtraActions={(row) => {
            if (tabId === "trash") {
              return (
                <>
                  <Button type="button" variant="outline" className="rounded-full px-3 py-1.5 text-xs" onClick={() => restoreFromTrash(row.id)}>
                    Restore
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-rose-200 px-3 py-1.5 text-xs text-rose-800 hover:bg-rose-50"
                    onClick={() => deleteForever(row.id)}
                  >
                    Delete
                  </Button>
                </>
              );
            }
            return (
              <Button type="button" variant="outline" className="rounded-full px-3 py-1.5 text-xs" onClick={() => moveToTrash(row.id)}>
                Trash
              </Button>
            );
          }}
        />
      )}
    </ManagerPortalPageShell>
  );
}
