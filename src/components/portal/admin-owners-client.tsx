"use client";

import { useEffect, useMemo, useState } from "react";
import { PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";
import { adminOwnerCounts } from "@/lib/demo-admin-owners";

export function AdminOwnersClient() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const { current, past } = useMemo(() => adminOwnerCounts(), [tick]);

  return (
    <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_14px_50px_-36px_rgba(15,23,42,0.16)] sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Owners</h1>

      <div className="mt-5 flex flex-wrap items-end gap-6">
        <div className="min-w-[10rem] rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-[0_8px_28px_-12px_rgba(15,23,42,0.14)]">
          <p className="text-2xl font-bold tabular-nums text-slate-900">{current}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Current owners</p>
        </div>
        <div className="min-w-[10rem] rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-[0_8px_28px_-12px_rgba(15,23,42,0.14)]">
          <p className="text-2xl font-bold tabular-nums text-slate-900">{past}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Past owners</p>
        </div>
      </div>
    </div>
  );
}
