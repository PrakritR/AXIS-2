"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import {
  MANAGER_TABLE_TH,
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
  PORTAL_TOOLBAR_GROUP,
  PORTAL_TOOLBAR_LABEL,
  PORTAL_TOOLBAR_PILL_BUTTON,
  PORTAL_TOOLBAR_PILL_BUTTON_ACTIVE,
} from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR_EXPANDABLE,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { formatPacificDate } from "@/lib/pacific-time";
import { isDemoModeActive } from "@/lib/demo/demo-session";

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
  managerId: string;
  active: boolean;
  joinedAt: string | null;
};

type AccountKind = "manager" | "resident";

type UnifiedRow =
  | ({ kind: "manager" } & ManagerRow)
  | ({ kind: "resident" } & SimpleRow);

type CategoryFilter = "management" | "resident";
type StatusTab = "active" | "disabled";
type TierFilter = "all" | "free" | "pro" | "business";
type ManagerPlan = "free" | "pro" | "business";

const MANAGER_PLAN_OPTIONS: { value: ManagerPlan; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "business", label: "Business" },
];

function normalizeManagerPlan(tier: string): ManagerPlan {
  const t = tier.toLowerCase();
  if (t === "pro" || t === "business") return t;
  return "free";
}

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
      <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold portal-badge-success">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-accent/30 px-2.5 py-1 text-xs font-semibold text-muted">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden />
      Disabled
    </span>
  );
}

function RolePill({ kind }: { kind: AccountKind }) {
  const styles: Record<AccountKind, string> = {
    manager: "portal-badge-info border",
    resident: "portal-badge-info border",
  };
  const labels: Record<AccountKind, string> = {
    manager: "Management",
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
    pro: "portal-badge-info border",
    business: "portal-badge-info border",
    free: "border-border bg-accent/30 text-muted",
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
  const [plan, setPlan] = useState<ManagerPlan>(() => normalizeManagerPlan(row.tier));
  const currentPlan = normalizeManagerPlan(row.tier);
  const planDirty = plan !== currentPlan;

  useEffect(() => {
    queueMicrotask(() => setPlan(normalizeManagerPlan(row.tier)));
  }, [row.tier]);

  const savePlan = async () => {
    if (!planDirty) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/managers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, tier: plan }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Could not update plan." }));
        showToast((error as string) || "Could not update plan.");
        return;
      }
      showToast(`Plan updated to ${plan === "free" ? "Free" : plan === "pro" ? "Pro" : "Business"}.`);
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

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
    <tr className={PORTAL_TABLE_DETAIL_ROW}>
      <td colSpan={4} className={PORTAL_TABLE_DETAIL_CELL}>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Account</p>
            <TierBadge tier={row.tier} />
            <StatusPill active={row.active} />
            {row.joinedAt ? (
              <span className="text-xs text-muted">
                Joined {formatPacificDate(row.joinedAt, { year: "numeric", month: "short", day: "numeric" })}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Plan</p>
            <Select
              className="h-9 min-h-0 w-auto min-w-[8.5rem] rounded-full px-3 py-1.5 text-sm"
              value={plan}
              onChange={(e) => setPlan(e.target.value as ManagerPlan)}
              disabled={busy}
            >
              {MANAGER_PLAN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className={`rounded-full ${row.active ? "border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)]" : ""}`}
              onClick={() => void toggle()}
              disabled={busy}
            >
              {busy && !confirmDelete && !planDirty ? "Updating…" : row.active ? "Disable account" : "Enable account"}
            </Button>
            {confirmDelete ? (
              <div className="flex items-center gap-2 rounded-full border px-3 py-1.5 portal-banner-danger">
                <span className="text-xs font-semibold text-rose-800">Delete manager and all properties?</span>
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
                  className="text-xs font-semibold text-muted hover:text-foreground"
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
                className="rounded-full border-rose-200 text-rose-700 hover:bg-[var(--status-overdue-bg)]"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                Delete account
              </Button>
            )}
          </div>

          <div className="ml-auto shrink-0">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-full px-4 text-xs"
              onClick={() => void savePlan()}
              disabled={busy || !planDirty}
            >
              {busy && planDirty ? "Saving…" : "Save plan"}
            </Button>
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
  row: { kind: "resident" } & SimpleRow;
  apiPath: "/api/admin/residents";
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
    <tr className={PORTAL_TABLE_DETAIL_ROW}>
      <td colSpan={4} className={PORTAL_TABLE_DETAIL_CELL}>
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Account</p>
            <StatusPill active={row.active} />
            {row.joinedAt ? (
              <span className="text-xs text-muted">
                Joined {formatPacificDate(row.joinedAt, { year: "numeric", month: "short", day: "numeric" })}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className={`rounded-full ${row.active ? "border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)]" : ""}`}
              onClick={() => void toggle()}
              disabled={busy}
            >
              {busy && !confirmDelete ? "Updating…" : row.active ? "Disable account" : "Enable account"}
            </Button>
            {confirmDelete ? (
              <div className="flex items-center gap-2 rounded-full border px-3 py-1.5 portal-banner-danger">
                <span className="text-xs font-semibold text-rose-800">
                  {apiPath === "/api/admin/residents"
                    ? "Delete resident, leases, and payments?"
                    : "Delete permanently?"}
                </span>
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
                  className="text-xs font-semibold text-muted hover:text-foreground"
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
                className="rounded-full border-rose-200 text-rose-700 hover:bg-[var(--status-overdue-bg)]"
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
  return <SimpleAccountDetailRow row={row} apiPath="/api/admin/residents" accountLabel="Resident" onRefresh={onRefresh} showToast={showToast} />;
}

export function AdminAxisUsersClient() {
  const { showToast } = useAppUi();
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [residents, setResidents] = useState<SimpleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<StatusTab>("active");
  const [category, setCategory] = useState<CategoryFilter>("management");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");

  const load = useCallback(async () => {
    if (isDemoModeActive()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [mRes, rRes] = await Promise.all([fetch("/api/admin/managers"), fetch("/api/admin/residents")]);
      const mJson = (await mRes.json()) as { managers?: ManagerRow[]; error?: string };
      const rJson = (await rRes.json()) as { residents?: SimpleRow[]; error?: string };
      if (!mRes.ok) {
        setLoadError(mJson.error ?? "Could not load manager accounts.");
        return;
      }
      if (!rRes.ok) {
        setLoadError(rJson.error ?? "Could not load resident accounts.");
        return;
      }
      setManagers(mJson.managers ?? []);
      setResidents(rJson.residents ?? []);
    } catch {
      setLoadError("Could not reach the server. Check that Supabase env vars are configured.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const unified = useMemo((): UnifiedRow[] => {
    const m: UnifiedRow[] = managers.map((r) => ({ kind: "manager" as const, ...r }));
    const res: UnifiedRow[] = residents.map((r) => ({ kind: "resident" as const, ...r }));
    return [...m, ...res].sort((a, b) => {
      const an = (a.email || a.kind).toLowerCase();
      const bn = (b.email || b.kind).toLowerCase();
      return an.localeCompare(bn);
    });
  }, [managers, residents]);

  const categoryCounts = useMemo(() => {
    const c = { management: 0, resident: 0 };
    for (const row of unified) {
      if (row.kind === "resident") c.resident += 1;
      else c.management += 1;
    }
    return c;
  }, [unified]);

  const { activeCount, disabledCount } = useMemo(() => {
    let a = 0;
    let d = 0;
    for (const row of unified) {
      if (category === "resident" && row.kind !== "resident") continue;
      if (category === "management" && row.kind === "resident") continue;
      if (row.kind === "manager" && tierFilter !== "all" && row.tier.toLowerCase() !== tierFilter) continue;
      if (row.active) a += 1;
      else d += 1;
    }
    return { activeCount: a, disabledCount: d };
  }, [category, tierFilter, unified]);

  const visible = useMemo(() => {
    return unified.filter((row) => {
      if (statusTab === "active" && !row.active) return false;
      if (statusTab === "disabled" && row.active) return false;
      if (category === "resident" && row.kind !== "resident") return false;
      if (category === "management" && row.kind === "resident") return false;
      if (row.kind === "manager" && tierFilter !== "all" && row.tier.toLowerCase() !== tierFilter) return false;
      return true;
    });
  }, [unified, statusTab, category, tierFilter]);

  const showTierFilter = category === "management";

  const STATUS_TABS: { id: StatusTab; label: string; count: number }[] = [
    { id: "active", label: "Active", count: activeCount },
    { id: "disabled", label: "Disabled", count: disabledCount },
  ];

  const ROLE_TABS: { id: CategoryFilter; label: string; count: number }[] = [
    { id: "management", label: "Management", count: categoryCounts.management },
    { id: "resident", label: "Residents", count: categoryCounts.resident },
  ];

  const TIER_OPTIONS: { id: TierFilter; label: string }[] = [
    { id: "all", label: "All tiers" },
    { id: "free", label: "Free" },
    { id: "pro", label: "Pro" },
    { id: "business", label: "Business" },
  ];

  return (
    <ManagerPortalPageShell
      title="Axis users"
      filterRow={
        <ManagerPortalFilterRow>
          <div>
            <p className={PORTAL_TOOLBAR_LABEL}>Category</p>
            <div className="mt-1.5">
              <ManagerPortalStatusPills
                tabs={ROLE_TABS}
                activeId={category}
                onChange={(id) => {
                  setCategory(id as CategoryFilter);
                  setExpandedKey(null);
                }}
              />
            </div>
          </div>
          <div>
            <p className={PORTAL_TOOLBAR_LABEL}>Status</p>
            <div className="mt-1.5">
              <ManagerPortalStatusPills
                tabs={STATUS_TABS}
                activeId={statusTab}
                onChange={(id) => {
                  setStatusTab(id as StatusTab);
                  setExpandedKey(null);
                }}
              />
            </div>
          </div>
          {showTierFilter ? (
            <div>
              <p className={PORTAL_TOOLBAR_LABEL}>Manager plan</p>
              <div className={`mt-1.5 ${PORTAL_TOOLBAR_GROUP}`}>
                {TIER_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setTierFilter(opt.id);
                      setExpandedKey(null);
                    }}
                    className={`${PORTAL_TOOLBAR_PILL_BUTTON} ${tierFilter === opt.id ? PORTAL_TOOLBAR_PILL_BUTTON_ACTIVE : ""}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </ManagerPortalFilterRow>
      }
    >
      <div className={PORTAL_DATA_TABLE_WRAP}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-muted">Loading…</p>
          </div>
        ) : loadError ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-rose-600">{loadError}</p>
            <button type="button" onClick={() => void load()} className="mt-3 text-xs font-semibold text-primary hover:underline">
              Try again
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-accent/30/30 px-4 py-16 text-center sm:py-20">
            <AxisHeaderMarkTile>
              <UsersEmptyIcon className="h-[26px] w-[26px]" />
            </AxisHeaderMarkTile>
            <p className="mt-4 text-sm font-medium text-muted">
              {unified.length === 0 ? "No accounts yet" : "No accounts match these filters"}
            </p>
          </div>
        ) : (
          <div className={PORTAL_DATA_TABLE_SCROLL}>
            <table className="w-full min-w-[min(100%,48rem)] border-collapse text-left">
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Category</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Account</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Plan</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const rowKey = `${row.kind}-${row.id}`;
                  const isOpen = expandedKey === rowKey;
                  return (
                    <Fragment key={rowKey}>
                      <tr
                        className={PORTAL_TABLE_TR_EXPANDABLE}
                        onClick={createPortalRowExpandClick(() => setExpandedKey(isOpen ? null : rowKey))}
                        aria-expanded={isOpen}
                      >
                        <td className={PORTAL_TABLE_TD}>
                          <RolePill kind={row.kind} />
                        </td>
                        <td className={PORTAL_TABLE_TD}>
                          <p className="font-semibold text-foreground">{row.fullName || row.email}</p>
                          <p className="mt-0.5 text-sm text-muted">{row.email}</p>
                          {row.managerId ? (
                            <p className="mt-0.5 font-mono text-xs text-muted">{row.managerId}</p>
                          ) : null}
                        </td>
                        <td className={PORTAL_TABLE_TD}>
                          {row.kind === "manager" ? <TierBadge tier={row.tier} /> : <span className="text-sm text-muted">—</span>}
                        </td>
                        <td className={PORTAL_TABLE_TD}>
                          <StatusPill active={row.active} />
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
    </ManagerPortalPageShell>
  );
}
