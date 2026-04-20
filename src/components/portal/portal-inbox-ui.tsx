"use client";

import type { ReactNode } from "react";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import { Button } from "@/components/ui/button";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import type { TabItem } from "@/components/ui/tabs";

/** Same chrome as admin inbox: list + table container */
export const PORTAL_INBOX_TABLE_WRAP = "overflow-hidden rounded-2xl border border-slate-200/90 bg-white";

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
}: {
  rows: PortalInboxTableRow[];
  onMarkRead?: (id: string) => void;
}) {
  return (
    <div className={PORTAL_INBOX_TABLE_WRAP}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200/90 bg-white">
              <th className={`${MANAGER_TABLE_TH} text-left`}>From</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Topic</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Preview</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>When</th>
              <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
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
                  <span className="line-clamp-2">{row.preview}</span>
                </td>
                <td className="px-5 py-4 align-middle text-sm text-slate-500">{row.whenLabel}</td>
                <td className="px-5 py-4 text-right align-middle">
                  {!row.read && onMarkRead ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-slate-200 px-4 py-2 text-sm font-medium text-slate-800"
                      onClick={() => onMarkRead(row.id)}
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
  );
}
