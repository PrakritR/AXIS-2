"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerSectionShell } from "@/components/portal/manager-section-shell";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { TabNav, type TabItem } from "@/components/ui/tabs";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";
import {
  markPartnerInboxMessageRead,
  readPartnerInboxMessages,
  type PartnerInboxMessage,
} from "@/lib/demo-admin-partner-inbox";

const tabs: TabItem[] = [
  { id: "unopened", label: "Unopened", href: "/admin/inbox/unopened" },
  { id: "opened", label: "Opened", href: "/admin/inbox/opened" },
  { id: "sent", label: "Sent", href: "/admin/inbox/sent" },
  { id: "trash", label: "Trash", href: "/admin/inbox/trash" },
];

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

export function AdminInboxClient({ tabId }: { tabId: string }) {
  const { showToast } = useAppUi();
  const [tick, setTick] = useState(0);

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

  const all = useMemo(() => readPartnerInboxMessages(), [tick]);

  const rows = useMemo(() => {
    if (tabId === "unopened") return all.filter((m) => !m.read);
    if (tabId === "opened") return all.filter((m) => m.read);
    return [] as PartnerInboxMessage[];
  }, [all, tabId]);

  const shellActions = [
    {
      label: "New message",
      variant: "primary" as const,
      onClick: () => showToast("Compose is not wired yet — partners reach you from axishousing.com/partner/contact."),
    },
    { label: "Refresh", variant: "outline" as const, onClick: refresh },
  ];

  const emptyCopy =
    tabId === "sent" || tabId === "trash"
      ? "Nothing to show yet"
      : tabId === "opened" && rows.length === 0
        ? "No opened messages yet"
        : "No partner messages yet";

  return (
    <ManagerSectionShell title="Inbox" actions={shellActions}>
      <div className="space-y-5">
        <TabNav items={tabs} activeId={tabId} />

        {tabId === "sent" || tabId === "trash" ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/90 bg-slate-50/30 px-4 py-16 text-center sm:py-20">
            <p className="text-sm font-medium text-slate-500">{emptyCopy}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/90 bg-slate-50/30 px-4 py-16 text-center sm:py-20">
            <p className="text-sm font-medium text-slate-500">{emptyCopy}</p>
            {tabId === "unopened" ? (
              <p className="mt-2 max-w-md text-xs text-slate-400">
                Partner inquiries sent from the public contact page appear here.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
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
                    <tr key={row.id} className="border-b border-slate-100 last:border-0">
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
                        {!row.read ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full border-slate-200 px-4 py-2 text-sm font-medium text-slate-800"
                            onClick={() => {
                              if (markPartnerInboxMessageRead(row.id)) {
                                showToast("Marked as read.");
                                setTick((t) => t + 1);
                              }
                            }}
                          >
                            Mark read
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </ManagerSectionShell>
  );
}
