"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  appendThreadReply,
  composeAdminSentMessage,
  markInboxMessageRead,
  readInboxMessages,
  roleAllowsThread,
  type InboxMessage,
  type InboxSenderRole,
} from "@/lib/demo-admin-partner-inbox";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";

const TABS = [
  { id: "unopened", label: "Unopened", href: "/admin/inbox/unopened" },
  { id: "opened", label: "Opened", href: "/admin/inbox/opened" },
  { id: "sent", label: "Sent", href: "/admin/inbox/sent" },
  { id: "trash", label: "Trash", href: "/admin/inbox/trash" },
] as const;

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

function roleBadge(role: InboxSenderRole) {
  const map: Record<InboxSenderRole, string> = {
    partner: "bg-sky-100 text-sky-900 ring-sky-200",
    manager: "bg-violet-100 text-violet-900 ring-violet-200",
    resident: "bg-emerald-100 text-emerald-900 ring-emerald-200",
    owner: "bg-amber-100 text-amber-950 ring-amber-200",
    admin: "bg-slate-200 text-slate-800 ring-slate-300",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${map[role]}`}>
      {role}
    </span>
  );
}

function filterRows(tabId: string, all: InboxMessage[]): InboxMessage[] {
  if (tabId === "sent") return all.filter((m) => m.folder === "sent");
  if (tabId === "trash") return all.filter((m) => m.folder === "trash");
  const inbox = all.filter((m) => m.folder === "inbox");
  if (tabId === "unopened") return inbox.filter((m) => !m.read);
  if (tabId === "opened") return inbox.filter((m) => m.read);
  return inbox;
}

export function AdminInboxClient({ tabId }: { tabId: string }) {
  const [tick, setTick] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [toName, setToName] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [composeTopic, setComposeTopic] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const bump = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const on = () => bump();
    window.addEventListener(ADMIN_UI_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(ADMIN_UI_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, [bump]);

  const all = useMemo(() => readInboxMessages(), [tick]);
  const rows = useMemo(() => filterRows(tabId, all), [all, tabId]);

  const openDetails = (row: InboxMessage) => {
    const willCollapse = expandedId === row.id;
    if (!willCollapse && !row.read && row.folder === "inbox") markInboxMessageRead(row.id);
    setExpandedId(willCollapse ? null : row.id);
    bump();
  };

  const sendCompose = () => {
    if (!toEmail.trim() || !composeTopic.trim() || !composeBody.trim()) return;
    composeAdminSentMessage({
      toEmail: toEmail.trim(),
      toName: toName.trim() || toEmail.trim(),
      topic: composeTopic.trim(),
      body: composeBody.trim(),
    });
    setComposeOpen(false);
    setToName("");
    setToEmail("");
    setComposeTopic("");
    setComposeBody("");
    bump();
  };

  const postReply = (messageId: string) => {
    const text = (replyDrafts[messageId] ?? "").trim();
    if (!text) return;
    appendThreadReply(messageId, "Axis Admin", text);
    setReplyDrafts((d) => ({ ...d, [messageId]: "" }));
    bump();
  };

  return (
    <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_14px_50px_-36px_rgba(15,23,42,0.16)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Inbox</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full px-5 py-2.5 text-[14px] font-semibold text-white shadow-[0_4px_20px_rgba(0,122,255,0.28)] transition hover:-translate-y-px"
            style={{ background: "linear-gradient(135deg, #007aff, #339cff)" }}
            onClick={() => setComposeOpen(true)}
          >
            New message
          </button>
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[14px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
            onClick={() => bump()}
          >
            Refresh
          </button>
        </div>
      </div>

      <nav className="mt-5 flex flex-wrap gap-2 border-b border-slate-100 pb-3" aria-label="Inbox folders">
        {TABS.map((t) => {
          const active = tabId === t.id;
          return (
            <Link
              key={t.id}
              href={t.href}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                active ? "bg-primary text-white shadow-[0_2px_14px_-2px_rgba(0,122,255,0.45)]" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-slate-500">Nothing in this folder.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200/90 bg-white">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">From</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Topic</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Preview</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">When</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr className={`border-b border-slate-100 ${expandedId === row.id ? "bg-slate-50/80" : ""}`}>
                      <td className="px-5 py-4 align-middle">
                        <p className="font-semibold text-slate-900">{row.name}</p>
                        <p className="mt-0.5 text-sm text-slate-500">{row.email}</p>
                      </td>
                      <td className="px-5 py-4 align-middle text-sm text-slate-800">{row.topic}</td>
                      <td className="max-w-[220px] px-5 py-4 align-middle text-sm text-slate-600">
                        <span className="line-clamp-2">{row.body}</span>
                      </td>
                      <td className="px-5 py-4 align-middle text-sm text-slate-500">{formatWhen(row.createdAt)}</td>
                      <td className="px-5 py-4 text-right align-middle">
                        <button
                          type="button"
                          className={`inline-flex rounded-full border px-4 py-2 text-sm font-semibold transition ${
                            expandedId === row.id
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-slate-200 text-slate-800 hover:bg-slate-50"
                          }`}
                          onClick={() => openDetails(row)}
                        >
                          {expandedId === row.id ? "Hide" : "Details"}
                        </button>
                      </td>
                    </tr>
                    {expandedId === row.id ? (
                      <tr className="border-b border-slate-200 bg-slate-50/90">
                        <td colSpan={5} className="px-5 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            {roleBadge(row.senderRole)}
                            {!row.read && row.folder === "inbox" ? (
                              <span className="text-xs font-medium text-amber-700">Marked read when opened</span>
                            ) : null}
                          </div>
                          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                            <div>
                              <dt className="text-xs font-semibold uppercase text-slate-400">Email</dt>
                              <dd className="font-medium text-slate-900">{row.email}</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-semibold uppercase text-slate-400">Topic</dt>
                              <dd className="font-medium text-slate-900">{row.topic}</dd>
                            </div>
                          </dl>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{row.body}</p>

                          <div className="mt-4 border-t border-slate-200 pt-4">
                            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Thread</p>
                            {row.thread.length === 0 ? (
                              <p className="mt-2 text-sm text-slate-500">No replies yet.</p>
                            ) : (
                              <ul className="mt-2 space-y-2">
                                {row.thread.map((r) => (
                                  <li key={r.id} className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm">
                                    <p className="text-xs font-semibold text-slate-500">
                                      {r.authorLabel} · {formatWhen(r.createdAt)}
                                    </p>
                                    <p className="mt-1 whitespace-pre-wrap text-slate-800">{r.body}</p>
                                  </li>
                                ))}
                              </ul>
                            )}

                            {roleAllowsThread(row.senderRole) ? (
                              <div className="mt-4">
                                <label className="text-xs font-semibold uppercase text-slate-500" htmlFor={`reply-${row.id}`}>
                                  Reply as Axis Admin (thread visible to portal sender in demo)
                                </label>
                                <textarea
                                  id={`reply-${row.id}`}
                                  rows={3}
                                  value={replyDrafts[row.id] ?? ""}
                                  onChange={(e) => setReplyDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                                  className="mt-2 w-full max-w-xl rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/25"
                                  placeholder="Write a reply…"
                                />
                                <button
                                  type="button"
                                  className="mt-2 inline-flex rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                                  onClick={() => postReply(row.id)}
                                >
                                  Post reply
                                </button>
                              </div>
                            ) : (
                              <p className="mt-4 text-xs text-slate-500">
                                Threads are enabled for messages from partner, manager, resident, or owner.
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {composeOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="compose-title">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <h2 id="compose-title" className="text-lg font-bold text-slate-900">
                New message
              </h2>
              <button type="button" className="rounded-full px-2 py-1 text-sm text-slate-500 hover:bg-slate-100" onClick={() => setComposeOpen(false)}>
                Close
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">Saves to Sent (demo localStorage).</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">To name</label>
                <input value={toName} onChange={(e) => setToName(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Recipient" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">To email</label>
                <input
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="name@example.com"
                  type="email"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Topic</label>
                <input value={composeTopic} onChange={(e) => setComposeTopic(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Message</label>
                <textarea value={composeBody} onChange={(e) => setComposeBody(e.target.value)} rows={4} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setComposeOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #007aff, #339cff)" }}
                disabled={!toEmail.trim() || !composeTopic.trim() || !composeBody.trim()}
                onClick={sendCompose}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
