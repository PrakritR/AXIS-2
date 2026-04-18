"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const PORTAL_PREFS_KEY = "axis.admin.portalShortcuts";

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-sky-200/80 bg-white px-4 py-4 shadow-[0_12px_40px_-28px_rgba(59, 102, 245,0.45)] transition hover:border-[#3b66f5]/40"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">{value}</p>
    </Link>
  );
}

export function AdminDashboard() {
  const [shortcuts, setShortcuts] = useState(false);

  useEffect(() => {
    try {
      setShortcuts(localStorage.getItem(PORTAL_PREFS_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PORTAL_PREFS_KEY, shortcuts ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [shortcuts]);

  return (
    <div className="space-y-6">
      <Card className="border-slate-200/90 bg-white p-5 shadow-sm">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={shortcuts}
            onChange={(e) => setShortcuts(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#3b66f5] focus:ring-[#3b66f5]"
          />
          <span>
            <span className="text-sm font-semibold text-slate-900">Enable preview portal launchers</span>
            <span className="mt-1 block text-xs text-slate-500">
              Show manager and resident shortcut launchers on this dashboard. Preference is stored only in this browser.
            </span>
          </span>
        </label>
      </Card>

      {shortcuts ? (
        <Card className="border-slate-200/90 bg-white p-6 shadow-sm">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Manager portal</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select className="min-w-[12rem] flex-1 rounded-full border border-slate-200 bg-slate-50/80 px-4 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3b66f5]/30">
                  <option>— choose manager —</option>
                </select>
                <Button type="button" className="rounded-full bg-[#3b66f5] px-5 shadow-[0_0_18px_rgba(59, 102, 245,0.35)]">
                  Launch preview
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Manager account sync and developer previews will populate this list.
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Resident portal</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select className="min-w-[12rem] flex-1 rounded-full border border-slate-200 bg-slate-50/80 px-4 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3b66f5]/30">
                  <option>— choose resident —</option>
                </select>
                <Button type="button" className="rounded-full bg-[#3b66f5] px-5 shadow-[0_0_18px_rgba(59, 102, 245,0.35)]">
                  Launch preview
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-500">Stub sessions and Airtable-backed screens will wire in here.</p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Properties · pending review"
          value="0"
          href="/admin/properties/pending-review"
        />
        <StatCard label="Managers · subscribed" value="0" href="/admin/managers" />
        <StatCard label="Leases · admin review" value="0" href="/admin/leases/admin-review" />
        <StatCard label="Announcements · scheduled" value="2" href="/admin/announcements" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Link
          href="/admin/inbox/unopened"
          className="flex items-center justify-between rounded-2xl border border-sky-200/80 bg-white px-5 py-4 shadow-[0_12px_40px_-28px_rgba(59, 102, 245,0.35)] transition hover:border-[#3b66f5]/40"
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Inbox · unopened</span>
            <p className="mt-2 text-sm text-slate-500">Prioritize new manager requests, escalations, and support replies.</p>
          </div>
          <span className="text-3xl font-semibold tabular-nums text-slate-900">0</span>
        </Link>

        <Link
          href="/admin/announcements"
          className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.18)] transition hover:border-slate-300"
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Announcements</span>
            <p className="mt-2 text-sm text-slate-500">Publish portfolio-wide updates to managers and residents from one queue.</p>
          </div>
          <span className="text-sm font-semibold text-slate-900">Open center →</span>
        </Link>
      </div>
    </div>
  );
}
