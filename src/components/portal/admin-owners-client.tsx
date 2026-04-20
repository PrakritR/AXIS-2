"use client";

import { useCallback, useEffect, useState } from "react";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import { PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";

type OwnerRow = {
  id: string;
  email: string;
  fullName: string;
  active: boolean;
  joinedAt: string | null;
};

type StatusTab = "active" | "disabled";

function OwnersEmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

function StatusPill({ active }: { active: boolean }) {
  if (active) {
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

function ExpandedDetail({
  row,
  onRefresh,
  showToast,
}: {
  row: OwnerRow;
  onRefresh: () => void;
  showToast: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/owners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, active: !row.active }),
      });
      if (!res.ok) { showToast("Could not update account."); return; }
      showToast(row.active ? "Owner account disabled." : "Owner account enabled.");
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/owners", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Could not delete account." }));
        showToast(error || "Could not delete account.");
        return;
      }
      showToast("Owner account deleted.");
      onRefresh();
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <tr className="bg-slate-50/60">
      <td colSpan={3} className="px-5 py-5">
        <div className="flex flex-wrap items-start gap-8">
          <div className="min-w-[160px] space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Account</p>
            <div className="pt-1">
              <StatusPill active={row.active} />
            </div>
            {row.joinedAt && (
              <p className="pt-1 text-xs text-slate-500">
                Joined {new Date(row.joinedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              
              className={`rounded-full ${row.active ? "border-rose-200 text-rose-800 hover:bg-rose-50" : ""}`}
              onClick={() => void toggle()}
              disabled={busy}
            >
              {busy && !confirmDelete ? "Updating…" : row.active ? "Disable account" : "Enable account"}
            </Button>

            {confirmDelete ? (
              <div className="flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5">
                <span className="text-xs font-semibold text-rose-800">Delete permanently?</span>
                <button
                  type="button"
                  className="rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  onClick={() => void deleteAccount()}
                  disabled={busy}
                >
                  {busy ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  type="button"
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                  onClick={() => setConfirmDelete(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                
                className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                Delete account
              </Button>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

export function AdminOwnersClient() {
  const { showToast } = useAppUi();
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<StatusTab>("active");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/owners");
      const body = (await res.json()) as { owners?: OwnerRow[]; error?: string };
      if (!res.ok) {
        setLoadError(body.error ?? "Could not load owners.");
        return;
      }
      setOwners(body.owners ?? []);
    } catch {
      setLoadError("Could not reach the server. Check that Supabase env vars are configured.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const activeCount = owners.filter((o) => o.active).length;
  const disabledCount = owners.filter((o) => !o.active).length;

  const visible = owners.filter((o) =>
    statusTab === "active" ? o.active : !o.active
  );

  const STATUS_TABS: { id: StatusTab; label: string; count: number }[] = [
    { id: "active", label: "Active", count: activeCount },
    { id: "disabled", label: "Disabled", count: disabledCount },
  ];

  return (
    <div className={PORTAL_SECTION_SURFACE}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Owners</h1>
        <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <div className="mt-5">
        <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setStatusTab(tab.id); setExpandedId(null); }}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 ${
                statusTab === tab.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                statusTab === tab.id ? "bg-slate-100 text-slate-700" : "bg-slate-200/60 text-slate-500"
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-slate-400">Loading…</p>
          </div>
        ) : loadError ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-rose-600">{loadError}</p>
            <button type="button" onClick={() => void load()} className="mt-3 text-xs font-semibold text-primary hover:underline">
              Try again
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-slate-50/30 px-4 py-16 text-center sm:py-20">
            <AxisHeaderMarkTile>
              <OwnersEmptyIcon className="h-[26px] w-[26px]" />
            </AxisHeaderMarkTile>
            <p className="mt-4 text-sm font-medium text-slate-500">
              {owners.length === 0 ? "No owner accounts yet" : "No owners match this filter"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200/90 bg-white">
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Owner</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Status</th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const isOpen = expandedId === row.id;
                  return (
                    <>
                      <tr key={row.id} className={`border-b border-slate-100 ${isOpen ? "" : "last:border-0"}`}>
                        <td className="px-5 py-4 align-middle">
                          <p className="font-semibold text-slate-900">{row.fullName || row.email}</p>
                          <p className="mt-0.5 text-sm text-slate-500">{row.email}</p>
                        </td>
                        <td className="px-5 py-4 align-middle">
                          <StatusPill active={row.active} />
                        </td>
                        <td className="px-5 py-4 text-right align-middle">
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full border-slate-200 px-4 py-2 text-sm font-medium text-slate-800"
                            onClick={() => setExpandedId(isOpen ? null : row.id)}
                          >
                            {isOpen ? "Hide" : "Details"}
                          </Button>
                        </td>
                      </tr>
                      {isOpen && (
                        <ExpandedDetail
                          key={`detail-${row.id}`}
                          row={row}
                          onRefresh={() => { setExpandedId(null); void load(); }}
                          showToast={showToast}
                        />
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
