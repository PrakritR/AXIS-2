"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { demoResidentInboxThreads } from "@/data/demo-portal";
import { ManagerSectionShell } from "./manager-section-shell";

export function ResidentInboxPanel() {
  const { showToast } = useAppUi();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [threads, setThreads] = useState(() => demoResidentInboxThreads.map((t) => ({ ...t })));
  const [reply, setReply] = useState("");
  const [composeSubject, setComposeSubject] = useState("");

  const unread = useMemo(() => threads.filter((t) => t.unread).length, [threads]);

  const markRead = (id: string, opts?: { silent?: boolean }) => {
    setThreads((ts) => ts.map((t) => (t.id === id ? { ...t, unread: false } : t)));
    if (!opts?.silent) showToast("Marked read (demo).");
  };

  const removeThread = (id: string) => {
    setThreads((ts) => ts.filter((t) => t.id !== id));
    setExpandedId((cur) => (cur === id ? null : cur));
    showToast("Thread deleted (demo).");
  };

  const sendReply = (id: string) => {
    if (!reply.trim()) {
      showToast("Write a reply first.");
      return;
    }
    showToast(`Reply sent on thread ${id} (demo).`);
    setReply("");
    markRead(id, { silent: true });
  };

  return (
    <ManagerSectionShell
      title="Inbox"
      kpis={[{ value: String(unread), label: "Unread" }]}
      actions={[
        {
          label: "Compose",
          variant: "primary",
          onClick: () => {
            if (!composeSubject.trim()) {
              showToast("Set a subject in the field below, then click Compose again.");
              return;
            }
            showToast(`New thread: ${composeSubject.trim()} (demo).`);
            setComposeSubject("");
          },
        },
        { label: "Refresh", variant: "outline" },
      ]}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          value={composeSubject}
          onChange={(e) => setComposeSubject(e.target.value)}
          placeholder="New message subject…"
          className="max-w-md"
        />
      </div>

      <ul className="space-y-2">
        {threads.map((t) => (
          <li key={t.id} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <button
              type="button"
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50/80"
              onClick={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
            >
              {t.unread ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden /> : <span className="w-2 shrink-0" />}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-slate-900">{t.from}</span>
                  <span className="text-xs text-slate-500">{t.when}</span>
                </span>
                <span className="mt-0.5 block text-sm font-medium text-slate-800">{t.subject}</span>
                <span className="mt-0.5 line-clamp-2 text-sm text-slate-600">{t.preview}</span>
              </span>
            </button>
            {expandedId === t.id ? (
              <div className="border-t border-slate-100 px-4 py-4 text-sm text-slate-700">
                <p>{t.body}</p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" className="flex-1" />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" className="rounded-full" onClick={() => sendReply(t.id)}>
                      Reply
                    </Button>
                    <Button type="button" variant="outline" className="rounded-full" onClick={() => markRead(t.id)}>
                      Mark read
                    </Button>
                    <Button type="button" variant="outline" className="rounded-full" onClick={() => removeThread(t.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </ManagerSectionShell>
  );
}
