"use client";

import { useCallback, useEffect, useState } from "react";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";

type ManagerRow = {
  id: string;
  email: string;
  fullName: string;
  managerId: string;
  tier: string;
  billing: string;
  active: boolean;
  joinedAt: string | null;
};

function ManagersEmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    pro: "border-blue-200/90 bg-blue-50 text-blue-800",
    business: "border-violet-200/90 bg-violet-50 text-violet-800",
    free: "border-slate-200/90 bg-slate-100 text-slate-600",
  };
  const cls = colors[tier.toLowerCase()] ?? colors.free;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${cls}`}>
      {tier}
    </span>
  );
}

function DetailSheet({
  row,
  onClose,
  onToggle,
  showToast,
}: {
  row: ManagerRow;
  onClose: () => void;
  onToggle: () => void;
  showToast: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/managers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, active: !row.active }),
      });
      if (!res.ok) { showToast("Could not update account."); return; }
      showToast(row.active ? "Manager account disabled." : "Manager account enabled.");
      onToggle();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px]" aria-label="Close" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200/90 bg-white shadow-[0_0_48px_-12px_rgba(15,23,42,0.2)]" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Manager details</h2>
          <Button type="button" variant="ghost" className="rounded-full px-3 py-1.5 text-sm" onClick={onClose}>Close</Button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div>
            <p className="text-base font-semibold text-slate-900">{row.fullName || row.email}</p>
            <p className="mt-1 text-sm text-slate-500">{row.email}</p>
            {row.managerId && (
              <p className="mt-2 font-mono text-xs text-slate-400">{row.managerId}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <TierBadge tier={row.tier} />
            <StatusPill active={row.active} />
          </div>
          {row.joinedAt && (
            <p className="text-xs text-slate-500">
              Joined {new Date(row.joinedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className={`w-full rounded-full ${row.active ? "border-rose-200 text-rose-800 hover:bg-rose-50" : ""}`}
            onClick={() => void toggle()}
            disabled={busy}
          >
            {busy ? "Updating…" : row.active ? "Disable account" : "Enable account"}
          </Button>
        </div>
      </aside>
    </>
  );
}

export function AdminManagersClient() {
  const { showToast } = useAppUi();
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<ManagerRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/managers");
      const body = (await res.json()) as { managers?: ManagerRow[]; error?: string };
      if (!res.ok) {
        setLoadError(body.error ?? "Could not load managers.");
        return;
      }
      setManagers(body.managers ?? []);
    } catch {
      setLoadError("Could not reach the server. Check that Supabase env vars are configured.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const current = managers.filter((m) => m.active).length;
  const past = managers.filter((m) => !m.active).length;

  return (
    <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_14px_50px_-36px_rgba(15,23,42,0.16)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Managers</h1>
        <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-6">
        <div className="min-w-[10rem] rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-[0_8px_28px_-12px_rgba(15,23,42,0.14)]">
          <p className="text-2xl font-bold tabular-nums text-slate-900">{current}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Active managers</p>
        </div>
        <div className="min-w-[10rem] rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-[0_8px_28px_-12px_rgba(15,23,42,0.14)]">
          <p className="text-2xl font-bold tabular-nums text-slate-900">{past}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Disabled managers</p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
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
        ) : managers.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-slate-50/30 px-4 py-16 text-center sm:py-20">
            <AxisHeaderMarkTile>
              <ManagersEmptyIcon className="h-[26px] w-[26px]" />
            </AxisHeaderMarkTile>
            <p className="mt-4 text-sm font-medium text-slate-500">No manager accounts yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200/90 bg-white">
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Manager</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Tier</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Status</th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {managers.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-4 align-middle">
                      <p className="font-semibold text-slate-900">{row.fullName || row.email}</p>
                      <p className="mt-0.5 text-sm text-slate-500">{row.email}</p>
                      {row.managerId && <p className="mt-0.5 font-mono text-xs text-slate-400">{row.managerId}</p>}
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <TierBadge tier={row.tier} />
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <StatusPill active={row.active} />
                    </td>
                    <td className="px-5 py-4 text-right align-middle">
                      <Button type="button" variant="outline" className="rounded-full border-slate-200 px-4 py-2 text-sm font-medium text-slate-800" onClick={() => setDetailRow(row)}>
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

      {detailRow && (
        <DetailSheet
          row={detailRow}
          onClose={() => setDetailRow(null)}
          onToggle={() => void load()}
          showToast={showToast}
        />
      )}
    </div>
  );
}
