"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ManagerSectionShell } from "./manager-section-shell";

const categories = [
  { id: "priority", label: "Priority", count: 4 },
  { id: "applications", label: "Applications", count: 8 },
  { id: "residents", label: "Residents", count: 12 },
  { id: "vendors", label: "Vendors", count: 3 },
];

const threads = [
  {
    id: "t1",
    category: "priority",
    from: "Sofia Nguyen",
    subject: "Lease packet question before signing",
    preview: "I’m ready to sign today, but I want to confirm the move-in utilities section...",
    time: "9:14 AM",
    unread: true,
    messages: [
      { author: "Sofia Nguyen", time: "9:14 AM", body: "I’m ready to sign today, but I want to confirm the move-in utilities section before I submit the lease." },
      { author: "You", time: "9:42 AM", body: "Absolutely. Gas is billed back monthly, and electricity stays in the resident’s name. I can update the packet copy if needed." },
    ],
  },
  {
    id: "t2",
    category: "applications",
    from: "Leasing Bot",
    subject: "Two new applications need review",
    preview: "Pioneer Heights received two new applications with complete screening data.",
    time: "8:32 AM",
    unread: true,
    messages: [
      { author: "Leasing Bot", time: "8:32 AM", body: "Pioneer Heights received two new applications with complete screening data. One includes a co-signer and is ready for review." },
    ],
  },
  {
    id: "t3",
    category: "vendors",
    from: "Northside Plumbing",
    subject: "Kitchen leak appointment confirmed",
    preview: "Our tech can be onsite tomorrow at 11:00 AM for Marina Commons room 7.",
    time: "Yesterday",
    unread: false,
    messages: [
      { author: "Northside Plumbing", time: "Yesterday", body: "Our tech can be onsite tomorrow at 11:00 AM for Marina Commons room 7. Please confirm unit access." },
    ],
  },
  {
    id: "t4",
    category: "residents",
    from: "Lila Chen",
    subject: "Move-in checklist completed",
    preview: "I uploaded the checklist and pet paperwork. Let me know what’s next.",
    time: "Yesterday",
    unread: false,
    messages: [
      { author: "Lila Chen", time: "Yesterday", body: "I uploaded the checklist and pet paperwork. Let me know what’s next for move-in." },
    ],
  },
];

export function ManagerInbox() {
  const [category, setCategory] = useState(categories[0].id);
  const visibleThreads = useMemo(() => threads.filter((thread) => thread.category === category), [category]);
  const [selectedThreadId, setSelectedThreadId] = useState(visibleThreads[0]?.id ?? threads[0].id);

  const selectedThread =
    visibleThreads.find((thread) => thread.id === selectedThreadId) ?? visibleThreads[0] ?? threads[0];

  return (
    <ManagerSectionShell
      eyebrow="Communications"
      title="Inbox"
      subtitle="A manager-focused messaging workspace with category triage on the left and the active thread open on the right."
      actions={[
        { label: "Compose" },
        { label: "Bulk triage", variant: "outline" },
      ]}
    >
      <Card className="overflow-hidden p-0">
        <div className="grid min-h-[720px] lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="border-b border-slate-200/80 bg-slate-50/70 p-4 lg:border-b-0 lg:border-r">
            <Input placeholder="Search inbox" className="bg-white" />
            <div className="mt-4 space-y-2">
              {categories.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setCategory(item.id);
                    setSelectedThreadId(threads.find((thread) => thread.category === item.id)?.id ?? "");
                  }}
                  className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                    category === item.id ? "bg-slate-950 text-white" : "bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span>{item.label}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs ${category === item.id ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {item.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-2">
              {visibleThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => setSelectedThreadId(thread.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    selectedThread?.id === thread.id
                      ? "border-primary/30 bg-primary/[0.08] shadow-sm"
                      : "border-transparent bg-white hover:border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{thread.from}</p>
                    <span className="text-xs font-medium text-slate-400">{thread.time}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-700">{thread.subject}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-500">{thread.preview}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-h-[420px] flex-col bg-white">
            <div className="border-b border-slate-200/80 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{selectedThread.subject}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    From {selectedThread.from} · {selectedThread.time}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline">
                    Snooze
                  </Button>
                  <Button type="button">Reply</Button>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-4 px-5 py-5">
              {selectedThread.messages.map((message) => (
                <div key={message.author + message.time} className="max-w-3xl rounded-3xl border border-slate-200/80 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold text-slate-900">{message.author}</p>
                    <span className="text-xs font-medium text-slate-400">{message.time}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{message.body}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200/80 px-5 py-4">
              <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-3">
                <textarea
                  className="min-h-[120px] w-full resize-none bg-transparent px-2 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  placeholder="Draft a response..."
                />
                <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-2">
                  <p className="text-xs text-slate-400">Shared inbox routing and templates can land here later.</p>
                  <Button type="button">Send</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </ManagerSectionShell>
  );
}
