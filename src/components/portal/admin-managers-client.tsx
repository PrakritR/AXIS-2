"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";
import {
  adminManagerCounts,
  filterManagers,
  readAdminManagers,
  setManagerStatus,
  type AdminManagerRow,
} from "@/lib/demo-admin-managers";

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function StatusPill({ status }: { status: "active" | "disabled" }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/90 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden />
      Disabled
    </span>
  );
}

function ManagerDetailSheet({
  open,
  onClose,
  row,
  onUpdated,
  showToast,
}: {
  open: boolean;
  onClose: () => void;
  row: AdminManagerRow | null;
  onUpdated: () => void;
  showToast: (m: string) => void;
}) {
  if (!open || !row) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px]"
        aria-label="Close details"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200/90 bg-white shadow-[0_0_48px_-12px_rgba(15,23,42,0.2)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-mgr-detail-title"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 id="admin-mgr-detail-title" className="text-lg font-semibold text-slate-900">
            Manager details
          </h2>
          <Button type="button" variant="ghost" className="rounded-full px-3 py-1.5 text-sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div>
            <p className="text-base font-semibold text-slate-900">{row.name}</p>
            <p className="mt-1 text-sm text-slate-500">{row.email}</p>
            <p className="mt-3 text-sm text-slate-700">{row.accountType}</p>
            <p className="mt-1 text-xs text-slate-500">Joined {row.joinedLabel}</p>
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Account</p>
          <div className="flex flex-col gap-2">
            {row.status === "disabled" ? (
              <Button
                type="button"
                className="rounded-full"
                onClick={() => {
                  if (setManagerStatus(row.id, "active")) {
                    showToast("Manager account enabled.");
                    onUpdated();
                    onClose();
                  } else showToast("Could not update account.");
                }}
              >
                Enable account
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-rose-200 text-rose-800 hover:bg-rose-50"
                onClick={() => {
                  if (setManagerStatus(row.id, "disabled")) {
                    showToast("Manager account disabled.");
                    onUpdated();
                    onClose();
                  } else showToast("Could not update account.");
                }}
              >
                Disable account
              </Button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export function AdminManagersClient() {
  const { showToast } = useAppUi();
  const [search, setSearch] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [tick, setTick] = useState(0);
  const [detailRow, setDetailRow] = useState<AdminManagerRow | null>(null);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
    showToast("Refreshed managers.");
  }, [showToast]);

  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const { current, past } = useMemo(() => adminManagerCounts(), [tick]);
  const allRows = useMemo(() => readAdminManagers(), [tick]);
  const rows = useMemo(
    () => filterManagers(allRows, search, propertyFilter),
    [allRows, search, propertyFilter],
  );

  return (
    <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_14px_50px_-36px_rgba(15,23,42,0.16)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Managers</h1>
        <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={refresh}>
          Refresh
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-6">
        <div className="min-w-[10rem] rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-[0_8px_28px_-12px_rgba(15,23,42,0.14)]">
          <p className="text-2xl font-bold tabular-nums text-slate-900">{current}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Current subscribers</p>
        </div>
        <div className="min-w-[10rem] rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-[0_8px_28px_-12px_rgba(15,23,42,0.14)]">
          <p className="text-2xl font-bold tabular-nums text-slate-900">{past}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Past subscribers</p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
        <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:min-w-[14rem]">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Select property</span>
          <label className="sr-only" htmlFor="admin-managers-property">
            Select property
          </label>
          <select
            id="admin-managers-property"
            className="w-full rounded-full border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
          >
            <option value="all">All properties (grouped)</option>
          </select>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full min-w-[10rem] max-w-xs rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 sm:w-auto"
        />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-slate-50/30 px-4 py-16 text-center sm:py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/90 bg-white text-slate-400 shadow-sm">
              <GridIcon className="h-7 w-7" />
            </div>
            <p className="mt-4 text-sm font-medium text-slate-500">
              {allRows.length === 0
                ? "No active managers"
                : "No managers match your filters."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200/90 bg-white">
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Manager
                  </th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Account
                  </th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Status
                  </th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-4 align-middle">
                      <p className="font-semibold text-slate-900">{row.name}</p>
                      <p className="mt-0.5 text-sm text-slate-500">{row.email}</p>
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <p className="font-semibold text-slate-900">{row.accountType}</p>
                      <p className="mt-0.5 text-sm text-slate-500">{row.joinedLabel}</p>
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="px-5 py-4 text-right align-middle">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full border-slate-200 px-4 py-2 text-sm font-medium text-slate-800"
                        onClick={() => setDetailRow(row)}
                      >
                        Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ManagerDetailSheet
        open={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        row={detailRow}
        onUpdated={() => setTick((t) => t + 1)}
        showToast={showToast}
      />
    </div>
  );
}
