"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import { PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
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

type SimpleRow = {
  id: string;
  email: string;
  fullName: string;
  active: boolean;
  joinedAt: string | null;
};

type AccountKind = "manager" | "owner" | "resident";

type UnifiedRow =
  | ({ kind: "manager" } & ManagerRow)
  | ({ kind: "owner" } & SimpleRow)
  | ({ kind: "resident" } & SimpleRow);

type CategoryFilter = "all" | AccountKind;
type StatusTab = "active" | "disabled";
type TierFilter = "all" | "free" | "pro" | "business";

function UsersEmptyIcon({ className }: { className?: string }) {
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

function RolePill({ kind }: { kind: AccountKind }) {
  const styles: Record<AccountKind, string> = {
    manager: "border-sky-200/90 bg-sky-50 text-sky-900",
    owner: "border-amber-200/90 bg-amber-50 text-amber-950",
    resident: "border-violet-200/90 bg-violet-50 text-violet-900",
  };
  const labels: Record<AccountKind, string> = {
    manager: "Manager",
    owner: "Owner",
    resident: "Resident",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[kind]}`}>
      {labels[kind]}
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

function ManagerDetailRow({
  row,
  onRefresh,
  showToast,
}: {
  row: { kind: "manager" } & ManagerRow;
  onRefresh: () => void;
  showToast: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/managers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, active: !row.active }),
      });
      if (!res.ok) {
        showToast("Could not update account.");
        return;
      }
      showToast(row.active ? "Manager account disabled." : "Manager account enabled.");
      onRefresh();
    } finally {
      setBusy(false);
    }
  };
  const deleteAccount = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/managers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Could not delete account." }));
        showToast((error as string) || "Could not delete account.");
        return;
      }
      showToast("Manager account deleted.");
      onRefresh();
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };
  return (
    <tr className="bg-slate-50/60">
      <td colSpan={5} className="px-5 py-5">
        <div className="flex flex-wrap items-start gap-8">
          <div className="min-w-[160px] space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Account</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <TierBadge tier={row.tier} />
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

function SimpleAccountDetailRow({
  row,
  apiPath,
  accountLabel,
  onRefresh,
  showToast,
}: {
  row: { kind: "owner" } & SimpleRow | { kind: "resident" } & SimpleRow;
  apiPath: "/api/admin/owners" | "/api/admin/residents";
  accountLabel: string;
  onRefresh: () => void;
  showToast: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      const res = await fetch(apiPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, active: !row.active }),
      });
      if (!res.ok) {
        showToast("Could not update account.");
        return;
      }
      showToast(
        row.active
          ? `${accountLabel} account disabled.`
          : `${accountLabel} account enabled.`,
      );
      onRefresh();
    } finally {
      setBusy(false);
    }
  };
  const deleteAccount = async () => {
    setBusy(true);
    try {
      const res = await fetch(apiPath, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Could not delete account." }));
        showToast((error as string) || "Could not delete account.");
        return;
      }
      showToast(`${accountLabel} account deleted.`);
      onRefresh();
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };
  return (
    <tr className="bg-slate-50/60">
      <td colSpan={5} className="px-5 py-5">
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

function ExpandedRow({
  row,
  onRefresh,
  showToast,
}: {
  row: UnifiedRow;
  onRefresh: () => void;
  showToast: (m: string) => void;
}) {
  if (row.kind === "manager") {
    return <ManagerDetailRow row={row} onRefresh={onRefresh} showToast={showToast} />;
  }
  if (row.kind === "owner") {
    return <SimpleAccountDetailRow row={row} apiPath="/api/admin/owners" accountLabel="Owner" onRefresh={onRefresh} showToast={showToast} />;
  }
  return <SimpleAccountDetailRow row={row} apiPath="/api/admin/residents" accountLabel="Resident" onRefresh={onRefresh} showToast={showToast} />;
}

export function AdminAxisUsersClient() {
  const { showToast } = useAppUi();
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [owners, setOwners] = useState<SimpleRow[]>([]);
  const [residents, setResidents] = useState<SimpleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<StatusTab>("active");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [mRes, oRes, rRes] = await Promise.all([
        fetch("/api/admin/managers"),
        fetch("/api/admin/owners"),
        fetch("/api/admin/residents"),
      ]);
      const mJson = (await mRes.json()) as { managers?: ManagerRow[]; error?: string };
      const oJson = (await oRes.json()) as { owners?: SimpleRow[]; error?: string };
      const rJson = (await rRes.json()) as { residents?: SimpleRow[]; error?: string };
      if (!mRes.ok) {
        setLoadError(mJson.error ?? "Could not load manager accounts.");
        return;
      }
      if (!oRes.ok) {
        setLoadError(oJson.error ?? "Could not load owner accounts.");
        return;
      }
      if (!rRes.ok) {
        setLoadError(rJson.error ?? "Could not load resident accounts.");
        return;
      }
      setManagers(mJson.managers ?? []);
      setOwners(oJson.owners ?? []);
      setResidents(rJson.residents ?? []);
    } catch {
      setLoadError("Could not reach the server. Check that Supabase env vars are configured.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unified = useMemo((): UnifiedRow[] => {
    const m: UnifiedRow[] = managers.map((r) => ({ kind: "manager" as const, ...r }));
    const o: UnifiedRow[] = owners.map((r) => ({ kind: "owner" as const, ...r }));
    const res: UnifiedRow[] = residents.map((r) => ({ kind: "resident" as const, ...r }));
    return [...m, ...o, ...res].sort((a, b) => {
      const an = (a.email || a.kind).toLowerCase();
      const bn = (b.email || b.kind).toLowerCase();
      return an.localeCompare(bn);
    });
  }, [managers, owners, residents]);

  const { activeCount, disabledCount, categoryCounts } = useMemo(() => {
    let a = 0;
    let d = 0;
    const c = { all: 0, manager: 0, owner: 0, resident: 0 };
    for (const row of unified) {
      if (row.active) a += 1;
      else d += 1;
      c.all += 1;
      c[row.kind] += 1;
    }
    return { activeCount: a, disabledCount: d, categoryCounts: c };
  }, [unified]);

  const visible = useMemo(() => {
    return unified.filter((row) => {
      if (statusTab === "active" && !row.active) return false;
      if (statusTab === "disabled" && row.active) return false;
      if (category !== "all" && row.kind !== category) return false;
      if (row.kind === "manager" && tierFilter !== "all" && row.tier.toLowerCase() !== tierFilter) return false;
      return true;
    });
  }, [unified, statusTab, category, tierFilter]);

  const showTierFilter = category === "all" || category === "manager";

  const STATUS_TABS: { id: StatusTab; label: string; count: number }[] = [
    { id: "active", label: "Active", count: activeCount },
    { id: "disabled", label: "Disabled", count: disabledCount },
  ];

  const ROLE_TABS: { id: CategoryFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: categoryCounts.all },
    { id: "manager", label: "Manager", count: categoryCounts.manager },
    { id: "owner", label: "Owner", count: categoryCounts.owner },
    { id: "resident", label: "Resident", count: categoryCounts.resident },
  ];

  const TIER_OPTIONS: { id: TierFilter; label: string }[] = [
    { id: "all", label: "All tiers" },
    { id: "free", label: "Free" },
    { id: "pro", label: "Pro" },
    { id: "business", label: "Business" },
  ];

  return (
    <div className={PORTAL_SECTION_SURFACE}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Axis users</h1>
        <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        All manager, owner, and resident accounts. Filter by category or status, then open details to enable, disable, or remove an account.
      </p>

      <div className="mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Category</p>
        <div className="mt-1.5 inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
          {ROLE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setCategory(tab.id);
                setExpandedKey(null);
              }}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 sm:px-4 sm:text-sm ${
                category === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  category === tab.id ? "bg-slate-100 text-slate-700" : "bg-slate-200/60 text-slate-500"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Status</p>
          <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusTab(tab.id);
                  setExpandedKey(null);
                }}
                className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 ${
                  statusTab === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                    statusTab === tab.id ? "bg-slate-100 text-slate-700" : "bg-slate-200/60 text-slate-500"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>
        {showTierFilter ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Manager plan</p>
            <div className="mt-1.5 inline-flex flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
              {TIER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setTierFilter(opt.id);
                    setExpandedKey(null);
                  }}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 ${
                    tierFilter === opt.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
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
              <UsersEmptyIcon className="h-[26px] w-[26px]" />
            </AxisHeaderMarkTile>
            <p className="mt-4 text-sm font-medium text-slate-500">
              {unified.length === 0 ? "No accounts yet" : "No accounts match these filters"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[min(100%,48rem)] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200/90 bg-white">
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Category</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Account</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Plan</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Status</th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Details</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const rowKey = `${row.kind}-${row.id}`;
                  const isOpen = expandedKey === rowKey;
                  return (
                    <Fragment key={rowKey}>
                      <tr className={`border-b border-slate-100 ${isOpen ? "" : "last:border-0"}`}>
                        <td className="px-5 py-4 align-middle">
                          <RolePill kind={row.kind} />
                        </td>
                        <td className="px-5 py-4 align-middle">
                          <p className="font-semibold text-slate-900">{row.fullName || row.email}</p>
                          <p className="mt-0.5 text-sm text-slate-500">{row.email}</p>
                          {row.kind === "manager" && row.managerId ? (
                            <p className="mt-0.5 font-mono text-xs text-slate-400">{row.managerId}</p>
                          ) : null}
                        </td>
                        <td className="px-5 py-4 align-middle">
                          {row.kind === "manager" ? <TierBadge tier={row.tier} /> : <span className="text-sm text-slate-400">—</span>}
                        </td>
                        <td className="px-5 py-4 align-middle">
                          <StatusPill active={row.active} />
                        </td>
                        <td className="px-5 py-4 text-right align-middle">
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full border-slate-200 px-4 py-2 text-sm font-medium text-slate-800"
                            onClick={() => setExpandedKey(isOpen ? null : rowKey)}
                            aria-expanded={isOpen}
                          >
                            {isOpen ? "Hide" : "Details"}
                          </Button>
                        </td>
                      </tr>
                      {isOpen ? (
                        <ExpandedRow
                          row={row}
                          onRefresh={() => {
                            setExpandedKey(null);
                            void load();
                          }}
                          showToast={showToast}
                        />
                      ) : null}
                    </Fragment>
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
