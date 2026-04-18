"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { adminOwnerCounts } from "@/lib/demo-admin-owners";
import { PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";

const launchPreviewClassName =
  "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-[14px] font-semibold text-white shadow-[0_0_18px_rgba(0,122,255,0.28)] outline-none transition hover:-translate-y-0.5 hover:shadow-[0_0_22px_rgba(0,122,255,0.35)] active:translate-y-px";

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
      className="rounded-2xl border border-primary/15 bg-white px-4 py-4 shadow-[0_12px_40px_-28px_rgba(0,122,255,0.22)] transition hover:border-primary/35"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">{value}</p>
    </Link>
  );
}

export function AdminDashboard() {
  const [ownerTotal, setOwnerTotal] = useState("0");

  useEffect(() => {
    const sync = () => {
      const { total } = adminOwnerCounts();
      setOwnerTotal(String(total));
    };
    sync();
    const on = () => sync();
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  return (
    <div className="space-y-6">
      <Card className="border-slate-200/90 bg-white p-6 shadow-sm">
        <div className="grid gap-8 lg:grid-cols-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Manager portal</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                aria-label="Manager preview"
                className="min-w-[12rem] flex-1 rounded-full border border-slate-200 bg-slate-50/80 px-4 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                defaultValue=""
              >
                <option value="">— choose manager —</option>
              </select>
              <Link
                href="/manager/dashboard"
                className={launchPreviewClassName}
                style={{
                  background: "linear-gradient(135deg, var(--primary), var(--primary-alt))",
                }}
              >
                Launch preview
              </Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Resident portal</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                aria-label="Resident preview"
                className="min-w-[12rem] flex-1 rounded-full border border-slate-200 bg-slate-50/80 px-4 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                defaultValue=""
              >
                <option value="">— choose resident —</option>
              </select>
              <Link
                href="/resident/dashboard"
                className={launchPreviewClassName}
                style={{
                  background: "linear-gradient(135deg, var(--primary), var(--primary-alt))",
                }}
              >
                Launch preview
              </Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Owner portal</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                aria-label="Owner preview"
                className="min-w-[12rem] flex-1 rounded-full border border-slate-200 bg-slate-50/80 px-4 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                defaultValue=""
              >
                <option value="">— choose owner —</option>
              </select>
              <Link
                href="/owner/dashboard"
                className={launchPreviewClassName}
                style={{
                  background: "linear-gradient(135deg, var(--primary), var(--primary-alt))",
                }}
              >
                Launch preview
              </Link>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Properties" value="0" href="/admin/properties" />
        <StatCard label="Managers" value="0" href="/admin/managers" />
        <StatCard label="Owners" value={ownerTotal} href="/admin/owners" />
        <StatCard label="Leases · in review" value="0" href="/admin/leases" />
        <StatCard label="Inbox · unopened" value="0" href="/admin/inbox/unopened" />
      </div>
    </div>
  );
}
