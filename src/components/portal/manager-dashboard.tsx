"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { useIsNativeApp } from "@/hooks/use-is-native-app";
import {
  getPartnerInquiryWindows,
  readPartnerInquiries,
  readPlannedEvents,
  syncScheduleRecordsFromServer,
} from "@/lib/demo-admin-scheduling";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";
import {
  PROPERTY_PIPELINE_EVENT,
  readScopedExtraListings,
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";
import {
  chargeDueLabel,
  HOUSEHOLD_CHARGES_EVENT,
  isHouseholdChargeOverdue,
  readChargesForManager,
  syncHouseholdChargesFromServer,
} from "@/lib/household-charges";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import {
  LEASE_PIPELINE_EVENT,
  readLeasePipeline,
  syncLeasePipelineFromServer,
} from "@/lib/lease-pipeline-storage";
import {
  MANAGER_APPLICATIONS_EVENT,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import {
  applicationVisibleToPortalUser,
  collectLinkedPropertyIdsForModule,
  moduleRowVisibleToPortalUser,
} from "@/lib/manager-portfolio-access";
import {
  MANAGER_WORK_ORDERS_EVENT,
  readManagerWorkOrderRows,
  syncManagerWorkOrdersFromServer,
} from "@/lib/manager-work-orders-storage";
import {
  readAllServiceRequests,
  SERVICE_REQUESTS_EVENT,
  syncServiceRequestsFromServer,
} from "@/lib/service-requests-storage";
import {
  MANAGER_OUTGOING_PAYMENTS_EVENT,
  readManagerOutgoingExpenses,
  syncManagerOutgoingExpensesFromServer,
} from "@/lib/manager-outgoing-payments";
import {
  loadPersistedInbox,
  MANAGER_INBOX_STORAGE_KEY,
  PORTAL_INBOX_CHANGED_EVENT,
  syncPersistedInboxFromServer,
} from "@/lib/portal-inbox-storage";
import {
  ManagerPortalPageShell,
  portalDashboardWelcomeSubtitle,
  PORTAL_DASHBOARD_STACK,
  formatCompactChargeLine,
  formatCompactPlacementLine,
} from "@/components/portal/portal-metrics";
import {
  PortalPreviewOverflowLink,
  PortalTableExpandChevron,
  isPortalRowClickIgnored,
  usePortalPreviewSlice,
} from "@/components/portal/portal-data-table";
import type { DashboardSectionId } from "@/lib/dashboard-preferences";
import { DashboardCustomizeModal } from "@/components/portal/dashboard-customize-modal";
import { useDashboardVisibility } from "@/hooks/use-dashboard-visibility";
import { SlidersHorizontal } from "lucide-react";
import { isSubmittedPendingApplicationRow } from "@/lib/rental-application/in-progress-application";
import { formatPacificDateTime } from "@/lib/pacific-time";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import type { DocumentExpirationSummary } from "@/lib/documents/document-expiration";

const BASE = "/portal";

/** Semantic status foreground tokens for the leading issue-row dots. */
const DOT_OVERDUE = "var(--status-overdue-fg)";
const DOT_PENDING = "var(--status-pending-fg)";
const DOT_CONFIRMED = "var(--status-confirmed-fg)";
const DOT_INFO = "var(--status-approved-fg)";

type PillTone = "pending" | "success" | "danger" | "info";

/**
 * Status accent tokens for a whole "Needs attention" group — the header rail,
 * title colour and count badge all read in the group's status colour so the
 * queue is scannable by colour alone (overdue → red, pending review → orange,
 * signatures/unread → blue, active → green). Reuses the shared `--status-*`
 * tokens so it flips with the light/dark theme like every other status surface.
 */
type AttentionTone = PillTone;
const ATTENTION_TONE: Record<AttentionTone, { fg: string; bg: string }> = {
  danger: { fg: "var(--status-overdue-fg)", bg: "var(--status-overdue-bg)" },
  pending: { fg: "var(--status-pending-fg)", bg: "var(--status-pending-bg)" },
  info: { fg: "var(--status-approved-fg)", bg: "var(--status-approved-bg)" },
  success: { fg: "var(--status-confirmed-fg)", bg: "var(--status-confirmed-bg)" },
};

/**
 * Compact relative-time label ("in 3d", "2h ago", "now") for time-bearing
 * attention rows — the live, at-a-glance timing the queue leans on. Falls back
 * to `null` for unparseable input so callers can drop the meta entirely.
 */
function relativeFromNow(iso: string | undefined | null, nowMs: number): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = t - nowMs;
  const past = diff < 0;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  if (min < 1) return "now";
  const suffix = (n: number, unit: string) => (past ? `${n}${unit} ago` : `in ${n}${unit}`);
  if (min < 60) return suffix(min, "m");
  const hr = Math.round(min / 60);
  if (hr < 24) return suffix(hr, "h");
  const day = Math.round(hr / 24);
  if (day < 7) return suffix(day, "d");
  const wk = Math.round(day / 7);
  return suffix(wk, "w");
}

/** Small theme-aware status pill (light/dark flip via `.portal-badge-*`). */
function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold portal-badge-${tone} [html[data-native]_&]:text-[9px]`}
    >
      {children}
    </span>
  );
}

/** Restrained KPI tile: big tabular number + small uppercase muted label. */
function KpiTile({
  label,
  value,
  sub,
  href,
  accent,
  dataAttr,
}: {
  label: string;
  value: string | number;
  sub?: string;
  href: string;
  accent?: boolean;
  dataAttr?: string;
}) {
  return (
    <Link
      href={href}
      data-attr={dataAttr}
      className="flex min-w-[8.75rem] flex-1 flex-col rounded-lg border border-border bg-card px-4 py-3.5 transition-colors duration-150 hover:border-primary/40 [html[data-native]_&]:min-w-[7.25rem] [html[data-native]_&]:rounded-lg [html[data-native]_&]:px-3.5 [html[data-native]_&]:py-3"
    >
      <span
        className={`text-[1.75rem] font-semibold leading-none tabular-nums tracking-[-0.02em] [html[data-native]_&]:text-[1.4rem] ${
          accent ? "text-[var(--status-overdue-fg)]" : "text-foreground"
        }`}
      >
        {value}
      </span>
      <span className="mt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted [html[data-native]_&]:mt-1.5 [html[data-native]_&]:text-[9px]">
        {label}
      </span>
      {sub ? (
        <span className="mt-0.5 text-[11px] text-muted/80 [html[data-native]_&]:text-[10px]">{sub}</span>
      ) : null}
    </Link>
  );
}

/** Dense Linear "issue" row: status dot · label + subtitle · meta · status pill · chevron. */
function IssueRow({
  href,
  dot,
  title,
  subtitle,
  meta,
  pill,
  dataAttr,
}: {
  href: string;
  dot?: string;
  title: string;
  subtitle?: string;
  meta?: string | null;
  pill?: ReactNode;
  dataAttr?: string;
}) {
  return (
    <Link
      href={href}
      data-attr={dataAttr}
      className="group flex items-center gap-3 px-3.5 py-2.5 transition-colors duration-150 hover:bg-[var(--secondary)] [html[data-native]_&]:gap-2.5 [html[data-native]_&]:px-3 [html[data-native]_&]:py-2"
    >
      {dot ? (
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: dot }} />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground [html[data-native]_&]:text-[13px]">
          {title}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-xs text-muted [html[data-native]_&]:text-[11px]">
            {subtitle}
          </span>
        ) : null}
      </span>
      {meta ? (
        <span className="hidden shrink-0 whitespace-nowrap text-xs tabular-nums text-muted sm:block">
          {meta}
        </span>
      ) : null}
      {pill ? <span className="shrink-0">{pill}</span> : null}
      <span
        aria-hidden
        className="shrink-0 text-sm text-muted/40 transition-colors group-hover:text-muted [html[data-native]_&]:hidden"
      >
        ›
      </span>
    </Link>
  );
}

/**
 * One "Needs attention" group, now a collapsible card: a clickable header (tiny
 * uppercase label · count · overflow badge · chevron) over a hairline-bordered
 * stack of dense issue rows (preview-sliced so native/mobile row limits +
 * overflow link are preserved).
 *
 * Collapse behaviour is what makes the dashboard survive a phone: a group opens
 * by default only when it has items, so the wall of "nothing here" empty states
 * collapses to one-line headers. The manager can tap any header to override.
 */
function AttentionGroup<T>({
  title,
  href,
  sectionId,
  tone,
  order = 0,
  badge,
  items,
  emptyMessage,
  keyForItem,
  renderRow,
}: {
  title: string;
  href: string;
  sectionId: DashboardSectionId;
  /** Status colour for the whole group (rail + title + count when non-empty). */
  tone: AttentionTone;
  /** Stable position for the staggered entrance delay (0-based). */
  order?: number;
  badge?: ReactNode;
  items: T[];
  emptyMessage: string;
  keyForItem: (item: T) => string;
  renderRow: (item: T) => ReactNode;
}) {
  const { visible, overflow } = usePortalPreviewSlice(items);
  const { isNative } = useIsNativeApp();
  const count = items.length;
  const isEmpty = count === 0;
  const accent = ATTENTION_TONE[tone];
  // null → follow the "open when non-empty" default (reactive to async loads);
  // boolean → the manager's explicit tap wins.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? !isEmpty;

  return (
    <div
      className="pl-attn-enter overflow-hidden rounded-lg border border-border bg-card"
      style={{
        animationDelay: `${Math.min(order, 8) * 55}ms`,
        // A status rail on the leading edge — only lit when the group has items,
        // so empty groups stay quiet instead of shouting a colour with a 0 next to it.
        borderLeftWidth: isEmpty ? undefined : 3,
        borderLeftColor: isEmpty ? undefined : accent.fg,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        data-attr={`dashboard-attention-toggle-${sectionId}`}
        onClick={() => setOverride(!open)}
        onKeyDown={(e) => {
          if (isPortalRowClickIgnored(e.target)) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOverride(!open);
          }
        }}
        className="flex cursor-pointer items-center gap-2 px-3.5 py-2.5 transition-colors hover:bg-[var(--secondary)] [html[data-native]_&]:px-3 [html[data-native]_&]:py-2"
      >
        <PortalTableExpandChevron expanded={open} />
        <h3
          className="min-w-0 text-xs font-bold uppercase tracking-[0.12em] [html[data-native]_&]:leading-snug"
          style={{ color: isEmpty ? "var(--muted)" : accent.fg }}
        >
          {title}
        </h3>
        <span
          className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
          style={
            isEmpty
              ? { color: "color-mix(in srgb, var(--muted) 60%, transparent)" }
              : { background: accent.bg, color: accent.fg }
          }
        >
          {count}
        </span>
        {badge ? <span className="shrink-0">{badge}</span> : null}
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Open ${title}`}
          data-attr="dashboard-attention-link"
          className="ml-auto shrink-0 whitespace-nowrap text-xs font-semibold text-primary hover:underline underline-offset-2 [html[data-native]_&]:text-sm"
        >
          →
        </Link>
      </div>
      {open ? (
        isEmpty ? (
          <p className="border-t border-border px-3.5 py-2.5 text-xs text-muted [html[data-native]_&]:px-3 [html[data-native]_&]:py-2">
            {emptyMessage}
          </p>
        ) : (
          <div className="border-t border-border">
            <div className="divide-y divide-border">
              {visible.map((item) => (
                <Fragment key={keyForItem(item)}>{renderRow(item)}</Fragment>
              ))}
            </div>
            {overflow > 0 ? (
              <div className="border-t border-border px-3.5 py-2 [html[data-native]_&]:px-3">
                <PortalPreviewOverflowLink
                  overflow={overflow}
                  href={href}
                  label={isNative ? `View all (${count}) →` : `View all ${count} →`}
                />
              </div>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}

function fmt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "soon";
  return formatPacificDateTime(d);
}

/** Parse a "$1,200.00" balance label into a numeric dollar amount for KPI sums. */
function parseMoneyLabel(label: string): number {
  const n = Number(String(label).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

type MonthPoint = { key: string; label: string; value: number };

/** The last 6 calendar months (oldest → current), keyed `YYYY-MM` with a short label. */
function lastSixMonths(nowMs: number): { key: string; label: string }[] {
  const base = new Date(nowMs);
  const out: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const m = new Date(base.getFullYear(), base.getMonth() - i, 1);
    out.push({
      key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`,
      label: m.toLocaleString("en-US", { month: "short" }),
    });
  }
  return out;
}

/** `YYYY-MM` bucket key for an ISO date, or null when unparseable. */
function monthKeyOf(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Sum a list into the 6 month buckets by an ISO-date accessor. */
function bucketByMonth<T>(
  items: T[],
  months: { key: string; label: string }[],
  dateOf: (item: T) => string | undefined | null,
  amountOf: (item: T) => number,
): MonthPoint[] {
  const sums = new Map(months.map((m) => [m.key, 0]));
  for (const item of items) {
    const key = monthKeyOf(dateOf(item));
    if (key && sums.has(key)) sums.set(key, sums.get(key)! + (amountOf(item) || 0));
  }
  return months.map((m) => ({ key: m.key, label: m.label, value: sums.get(m.key) ?? 0 }));
}

function formatUsdShort(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(amount)}`;
}

/**
 * Cash-flow trend card: payments collected vs. expenses over the last 6 months,
 * as a theme-aware grouped bar chart (CSS heights, no chart lib). Bars scale to
 * the tallest value across both series; totals + net summarize the window.
 */
function DashboardTrends({ payments, expenses }: { payments: MonthPoint[]; expenses: MonthPoint[] }) {
  const totalIn = payments.reduce((s, p) => s + p.value, 0);
  const totalOut = expenses.reduce((s, e) => s + e.value, 0);
  const net = totalIn - totalOut;
  const max = Math.max(1, ...payments.map((p) => p.value), ...expenses.map((e) => e.value));
  const hasAny = totalIn > 0 || totalOut > 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 [html[data-native]_&]:p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">Cash flow</h2>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.07em] text-muted/70">Last 6 months</p>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <div className="text-sm font-semibold tabular-nums text-[var(--status-confirmed-fg)]">
              {formatUsd(totalIn)}
            </div>
            <div className="text-[10px] uppercase tracking-[0.06em] text-muted/70">Collected</div>
          </div>
          <div>
            <div className="text-sm font-semibold tabular-nums text-[var(--status-overdue-fg)]">
              {formatUsd(totalOut)}
            </div>
            <div className="text-[10px] uppercase tracking-[0.06em] text-muted/70">Expenses</div>
          </div>
          <div>
            <div
              className={`text-sm font-semibold tabular-nums ${net >= 0 ? "text-foreground" : "text-[var(--status-overdue-fg)]"}`}
            >
              {net >= 0 ? "" : "−"}
              {formatUsd(Math.abs(net))}
            </div>
            <div className="text-[10px] uppercase tracking-[0.06em] text-muted/70">Net</div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-[3px]" style={{ background: "var(--status-confirmed-fg)" }} />
          Payments
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-[3px]" style={{ background: "var(--status-overdue-fg)" }} />
          Expenses
        </span>
      </div>

      {hasAny ? (
        <div className="mt-4 flex h-40 items-end gap-2 sm:gap-4 [html[data-native]_&]:h-32">
          {payments.map((p, i) => {
            const e = expenses[i];
            const inPct = Math.round((p.value / max) * 100);
            const outPct = Math.round(((e?.value ?? 0) / max) * 100);
            return (
              <div key={p.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <div className="flex h-full w-full items-end justify-center gap-1">
                  <div
                    className="group relative w-full max-w-[1.6rem] rounded-t-[3px] bg-[var(--status-confirmed-fg)] transition-[height] duration-500"
                    style={{ height: `${Math.max(p.value > 0 ? 3 : 0, inPct)}%` }}
                    title={`Payments · ${p.label}: ${formatUsd(p.value)}`}
                  />
                  <div
                    className="group relative w-full max-w-[1.6rem] rounded-t-[3px] bg-[var(--status-overdue-fg)] transition-[height] duration-500"
                    style={{ height: `${Math.max((e?.value ?? 0) > 0 ? 3 : 0, outPct)}%` }}
                    title={`Expenses · ${e?.label ?? p.label}: ${formatUsd(e?.value ?? 0)}`}
                  />
                </div>
                <span className="text-[10px] font-medium text-muted [html[data-native]_&]:text-[9px]">
                  {p.label}
                </span>
                <span className="text-[9px] tabular-nums text-muted/60 [html[data-native]_&]:hidden">
                  {formatUsdShort(p.value)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted [html[data-native]_&]:text-xs">
          No payments or expenses recorded yet. Collected rent and logged expenses will chart here.
        </p>
      )}
    </div>
  );
}

export function ManagerDashboard({ displayName = "there" }: { displayName?: string }) {
  const { userId, ready: authReady } = useManagerUserId();
  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);
  const [nowMs] = useState(() => Date.now());
  const [docExpirySummary, setDocExpirySummary] = useState<DocumentExpirationSummary | null>(null);
  const { visibility, setVisible, reset } = useDashboardVisibility(userId);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  useEffect(() => {
    if (!authReady || !userId || isDemoModeActive()) {
      setDocExpirySummary(null);
      return;
    }
    void fetch("/api/manager-documents/expiration-summary", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.summary) setDocExpirySummary(data.summary as DocumentExpirationSummary);
      })
      .catch(() => setDocExpirySummary(null));
  }, [authReady, userId, tick]);

  useEffect(() => {
    if (!authReady || !userId) {
      return;
    }
    void Promise.allSettled([
      syncManagerApplicationsFromServer({ managerUserId: userId }),
      syncLeasePipelineFromServer(userId),
      syncPropertyPipelineFromServer(),
      syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY),
      syncHouseholdChargesFromServer(true),
      syncScheduleRecordsFromServer(),
      syncManagerWorkOrdersFromServer(),
      syncServiceRequestsFromServer(),
      syncManagerOutgoingExpensesFromServer(),
    ]).then(bump);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, bump);
    window.addEventListener(LEASE_PIPELINE_EVENT, bump);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, bump);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, bump);
    window.addEventListener(ADMIN_UI_EVENT, bump);
    window.addEventListener(PORTAL_INBOX_CHANGED_EVENT, bump);
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
    window.addEventListener(SERVICE_REQUESTS_EVENT, bump);
    window.addEventListener(MANAGER_OUTGOING_PAYMENTS_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, bump);
      window.removeEventListener(LEASE_PIPELINE_EVENT, bump);
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, bump);
      window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, bump);
      window.removeEventListener(ADMIN_UI_EVENT, bump);
      window.removeEventListener(PORTAL_INBOX_CHANGED_EVENT, bump);
      window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
      window.removeEventListener(SERVICE_REQUESTS_EVENT, bump);
      window.removeEventListener(MANAGER_OUTGOING_PAYMENTS_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, [userId, authReady]);

  const data = useMemo(() => {
    void tick;
    if (!userId) return null;

    const allApps = readManagerApplicationRows().filter((a) => applicationVisibleToPortalUser(a, userId));
    const pendingApps = allApps.filter((a) => isSubmittedPendingApplicationRow(a));

    const leases = readLeasePipeline(userId);
    const pendingLeaseRows = leases
      .filter((l) => l.status === "Manager Signature Pending" || l.status === "Resident Signature Pending")
      .sort((a, b) => new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime());

    const charges = readChargesForManager(userId, { linkedPropertyIds: collectLinkedPropertyIdsForModule(userId ?? "", "payments") });
    const pendingCharges = charges
      .filter((c) => c.status === "pending")
      .sort((a, b) => {
        const aOverdue = isHouseholdChargeOverdue(a);
        const bOverdue = isHouseholdChargeOverdue(b);
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    const managerWorkOrders = readManagerWorkOrderRows().filter((w) =>
      moduleRowVisibleToPortalUser(w, userId, "services"),
    );
    const pendingServiceRequests = readAllServiceRequests().filter(
      (r) => moduleRowVisibleToPortalUser(r, userId, "services") && r.status === "pending",
    );
    const pendingWorkOrders = managerWorkOrders.filter((w) => w.bucket === "open");
    const serviceItems = [
      ...pendingServiceRequests.map((r) => ({
        id: `sr-${r.id}`,
        title: r.offerName || "Add-on service",
        subtitle: [r.residentName || r.residentEmail, r.price].filter(Boolean).join(" · ") || "—",
        status: "pending" as const,
        sortKey: new Date(r.requestedAt).getTime() || 0,
      })),
      ...pendingWorkOrders.map((w) => ({
        id: `wo-${w.id}`,
        title: w.title || "Work order",
        subtitle: [w.propertyName, w.unit].filter(Boolean).join(" · ") || "—",
        status: "pending" as const,
        sortKey: w.scheduledAtIso ? new Date(w.scheduledAtIso).getTime() : 0,
      })),
    ].sort((a, b) => b.sortKey - a.sortKey);
    const pendingServiceCount = pendingServiceRequests.length + pendingWorkOrders.length;

    const inboxThreads = loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, [])
      .filter((t) => t.folder === "inbox" && t.unread)
      .slice(0, 5);

    const cutoff = nowMs - 30 * 60 * 1000;
    const tours = [
      ...readPartnerInquiries()
        .filter((r) => r.kind === "tour" && r.status === "pending" && r.managerUserId === userId)
        .flatMap((r) =>
          getPartnerInquiryWindows(r).map((w) => ({
            id: `${r.id}-${w.start}`,
            label: r.name,
            propertyTitle: r.propertyTitle ?? "",
            status: "pending" as const,
            startMs: new Date(w.start).getTime(),
            start: w.start,
          })),
        ),
      ...readPlannedEvents()
        .filter((e) => e.kind === "tour" && e.managerUserId === userId)
        .map((e) => ({
          id: e.id,
          label: e.attendeeName ?? "Confirmed tour",
          propertyTitle: e.propertyTitle ?? "",
          status: "confirmed" as const,
          startMs: new Date(e.start).getTime(),
          start: e.start,
        })),
    ]
      .filter((t) => Number.isFinite(t.startMs) && t.startMs >= cutoff)
      .sort((a, b) => a.startMs - b.startMs);

    const livePropertyCount = readScopedExtraListings(userId).filter(
      (p) => p.adminPublishLive === true,
    ).length;

    const activeResidents = leases
      .filter((l) => l.status === "Fully Signed")
      .sort((a, b) => new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime());

    // Cash-flow trend series (last 6 months), computed from real local stores:
    // payments = PAID charges bucketed by paid/created date; expenses = logged
    // outgoing expenses bucketed by expense date.
    const months = lastSixMonths(nowMs);
    const paymentsByMonth = bucketByMonth(
      charges.filter((c) => c.status === "paid"),
      months,
      (c) => c.paidAt ?? c.createdAt,
      (c) => parseMoneyLabel(c.amountLabel || c.balanceLabel),
    );
    const expensesByMonth = bucketByMonth(
      readManagerOutgoingExpenses(),
      months,
      (e) => e.expenseDate,
      (e) => e.amountCents / 100,
    );

    // Leases specifically awaiting the MANAGER's signature (their action).
    const managerSignatureLeaseCount = pendingLeaseRows.filter(
      (l) => l.status === "Manager Signature Pending",
    ).length;
    // Vacant = units actively listed for rent (a live listing is a unit to fill).
    const roomsVacant = livePropertyCount;

    return {
      pendingApps,
      pendingLeaseRows,
      pendingCharges,
      inboxThreads,
      serviceItems,
      pendingServiceCount,
      tours,
      livePropertyCount,
      activeResidents,
      paymentsByMonth,
      expensesByMonth,
      managerSignatureLeaseCount,
      roomsVacant,
    };
  }, [tick, userId, nowMs]);

  if (!data) return null;

  const {
    pendingApps,
    pendingLeaseRows,
    pendingCharges,
    inboxThreads,
    serviceItems,
    pendingServiceCount,
    tours,
    activeResidents,
    paymentsByMonth,
    expensesByMonth,
    managerSignatureLeaseCount,
    roomsVacant,
  } = data;

  const pendingTours = tours.filter((t) => t.status === "pending");
  const overdueCharges = pendingCharges.filter((c) => isHouseholdChargeOverdue(c));
  const overdueChargeCount = overdueCharges.length;
  const overdueBalanceLabel = formatUsd(
    overdueCharges.reduce((sum, c) => sum + parseMoneyLabel(c.balanceLabel), 0),
  );

  // Reflect only the sections the manager keeps visible, so the "N open" badge
  // matches what's actually on their dashboard.
  const openCount =
    (visibility.tours ? pendingTours.length : 0) +
    (visibility.applications ? pendingApps.length : 0) +
    (visibility.leases ? pendingLeaseRows.length : 0) +
    (visibility.payments ? pendingCharges.length : 0) +
    (visibility.services ? serviceItems.length : 0) +
    (visibility.inbox ? inboxThreads.length : 0);

  const anyAttentionVisible =
    visibility.tours ||
    visibility.applications ||
    visibility.leases ||
    visibility.residents ||
    visibility.payments ||
    visibility.services ||
    visibility.inbox;

  const showDocExpiryBanner =
    docExpirySummary && (docExpirySummary.expired > 0 || docExpirySummary.within30 > 0);
  const docExpiryHref =
    docExpirySummary && docExpirySummary.expired > 0
      ? `${BASE}/documents/library?expiry=expired`
      : `${BASE}/documents/library?expiry=expiring30`;

  return (
    <ManagerPortalPageShell
      title="Dashboard"
      subtitle={portalDashboardWelcomeSubtitle(displayName)}
      hideTitleOnNative
    >
      <div className={PORTAL_DASHBOARD_STACK}>
        {showDocExpiryBanner ? (
          <Link
            href={docExpiryHref}
            className={`block rounded-lg border px-4 py-3 text-sm transition-opacity hover:opacity-90 ${
              docExpirySummary!.expired > 0 ? "portal-banner-danger" : "portal-banner-pending"
            }`}
            data-attr="dashboard-document-expiry-banner"
          >
            <p className="font-semibold tracking-[-0.01em]">
              Document compliance
              {docExpirySummary!.expired > 0
                ? ` · ${docExpirySummary!.expired} expired`
                : ` · ${docExpirySummary!.within30} expiring within 30 days`}
            </p>
            <p className="mt-0.5 text-xs opacity-90">Open your document library to review renewals →</p>
          </Link>
        ) : null}

        {/* Command center — restrained KPI stat row (scrolls horizontally on narrow screens). */}
        <div className="-mx-1 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-2.5 [html[data-native]_&]:gap-2">
            <KpiTile
              label="Rooms vacant"
              value={roomsVacant}
              sub={roomsVacant > 0 ? "listed & available" : "fully occupied"}
              accent={roomsVacant > 0}
              href={`${BASE}/properties`}
              dataAttr="dashboard-kpi-vacant"
            />
            <KpiTile
              label="Leases to sign"
              value={pendingLeaseRows.length}
              sub={
                managerSignatureLeaseCount > 0
                  ? `${managerSignatureLeaseCount} need your signature`
                  : pendingLeaseRows.length > 0
                    ? "awaiting resident"
                    : "none pending"
              }
              accent={managerSignatureLeaseCount > 0}
              href={`${BASE}/leases`}
              dataAttr="dashboard-kpi-leases"
            />
            <KpiTile
              label="Applicants to review"
              value={pendingApps.length}
              sub={pendingApps.length > 0 ? "pending review" : "all caught up"}
              href={`${BASE}/applications`}
              dataAttr="dashboard-kpi-applications"
            />
            <KpiTile
              label="Overdue balance"
              value={overdueBalanceLabel}
              sub={
                overdueChargeCount > 0
                  ? `${overdueChargeCount} overdue ${overdueChargeCount === 1 ? "charge" : "charges"}`
                  : "None overdue"
              }
              accent={overdueChargeCount > 0}
              href={`${BASE}/payments`}
              dataAttr="dashboard-kpi-overdue"
            />
            <KpiTile
              label="Open services"
              value={serviceItems.length}
              href={`${BASE}/services/requests`}
              dataAttr="dashboard-kpi-services"
            />
          </div>
        </div>

        {/* Financial trend graphs — payments collected vs. expenses, last 6 months. */}
        {visibility.cashflow ? (
          <DashboardTrends payments={paymentsByMonth} expenses={expensesByMonth} />
        ) : null}

        {/* Needs attention — a live, colour-coded queue: big all-caps heading over
            status-railed group cards that stream in with a staggered entrance. */}
        <div className="space-y-4 [html[data-native]_&]:space-y-3">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="text-primary text-xl leading-none [html[data-native]_&]:text-lg">
              ✦
            </span>
            <h2 className="text-2xl font-extrabold uppercase leading-none tracking-[0.02em] text-foreground [html[data-native]_&]:text-xl">
              Needs Attention
            </h2>
            {openCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-[var(--secondary)] px-2.5 py-0.5 text-[11px] font-medium text-muted">
                <span
                  aria-hidden
                  className="pl-attn-pulse size-1.5 rounded-full"
                  style={{ background: DOT_CONFIRMED }}
                />
                {openCount} open
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setCustomizeOpen(true)}
              data-attr="dashboard-customize-open"
              className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              <span className="[html[data-native]_&]:sr-only">Customize</span>
            </button>
          </div>

          {visibility.tours ? (
            <AttentionGroup
              title="Tour requests"
              href={`${BASE}/calendar`}
              sectionId="tours"
              tone="pending"
              order={0}
              items={pendingTours}
              emptyMessage="No pending tour requests right now."
              keyForItem={(tour) => tour.id}
              renderRow={(tour) => (
                <IssueRow
                  href={`${BASE}/calendar`}
                  dot={DOT_PENDING}
                  title={tour.label}
                  subtitle={tour.propertyTitle || "—"}
                  meta={relativeFromNow(tour.start, nowMs) ?? fmt(tour.start)}
                  pill={<StatusPill tone="pending">Pending</StatusPill>}
                  dataAttr="dashboard-attention-tour"
                />
              )}
            />
          ) : null}

          {visibility.applications ? (
            <AttentionGroup
              title="Applications"
              href={`${BASE}/applications`}
              sectionId="applications"
              tone="pending"
              order={1}
              items={pendingApps}
              emptyMessage="No pending applications. You're all caught up."
              keyForItem={(app) => app.id}
              renderRow={(app: DemoApplicantRow) => (
                <IssueRow
                  href={`${BASE}/applications`}
                  dot={DOT_PENDING}
                  title={app.name || app.email || "Unknown"}
                  subtitle={app.property || "—"}
                  pill={<StatusPill tone="pending">{app.stage || "Pending"}</StatusPill>}
                  dataAttr="dashboard-attention-application"
                />
              )}
            />
          ) : null}

          {visibility.leases ? (
            <AttentionGroup
              title="Leases pending signature"
              href={`${BASE}/leases`}
              sectionId="leases"
              tone="info"
              order={2}
              items={pendingLeaseRows}
              emptyMessage="No leases waiting for a signature."
              keyForItem={(lease) => lease.id}
              renderRow={(lease: LeasePipelineRow) => {
                const yourTurn = lease.status === "Manager Signature Pending";
                return (
                  <IssueRow
                    href={`${BASE}/leases`}
                    dot={yourTurn ? DOT_INFO : DOT_PENDING}
                    title={lease.residentName || lease.residentEmail}
                    subtitle={formatCompactPlacementLine(lease.unit || "—")}
                    meta={lease.signedRentLabel}
                    pill={
                      <StatusPill tone={yourTurn ? "info" : "pending"}>
                        {yourTurn ? "Your signature" : "Resident signing"}
                      </StatusPill>
                    }
                    dataAttr="dashboard-attention-lease"
                  />
                );
              }}
            />
          ) : null}

          {visibility.residents ? (
            <AttentionGroup
              title="Residents"
              href={`${BASE}/residents/current`}
              sectionId="residents"
              tone="success"
              order={3}
              items={activeResidents}
              emptyMessage="No current residents yet."
              keyForItem={(lease) => lease.id}
              renderRow={(lease: LeasePipelineRow) => (
                <IssueRow
                  href={`${BASE}/residents/current`}
                  dot={DOT_CONFIRMED}
                  title={lease.residentName || lease.residentEmail}
                  subtitle={formatCompactPlacementLine(lease.unit || "—")}
                  meta={lease.signedRentLabel}
                  pill={<StatusPill tone="success">Active</StatusPill>}
                  dataAttr="dashboard-attention-resident"
                />
              )}
            />
          ) : null}

          {visibility.payments ? (
            <AttentionGroup
              title="Pending & overdue payments"
              href={`${BASE}/payments`}
              sectionId="payments"
              tone={overdueChargeCount > 0 ? "danger" : "pending"}
              order={4}
              badge={
                overdueChargeCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-[var(--status-overdue-fg)]">
                    <span aria-hidden className="size-1.5 rounded-full bg-current" />
                    {overdueChargeCount} overdue
                  </span>
                ) : null
              }
              items={pendingCharges}
              emptyMessage="No pending or overdue payments right now."
              keyForItem={(charge) => charge.id}
              renderRow={(charge) => {
                const overdue = isHouseholdChargeOverdue(charge);
                return (
                  <IssueRow
                    href={`${BASE}/payments`}
                    dot={overdue ? DOT_OVERDUE : DOT_PENDING}
                    title={charge.residentName || charge.residentEmail}
                    subtitle={formatCompactChargeLine(
                      charge.title || "Charge",
                      charge.balanceLabel,
                      chargeDueLabel(charge),
                      { omitBalance: true },
                    )}
                    meta={charge.balanceLabel}
                    pill={
                      <StatusPill tone={overdue ? "danger" : "pending"}>
                        {overdue ? "Overdue" : "Pending"}
                      </StatusPill>
                    }
                    dataAttr="dashboard-attention-payment"
                  />
                );
              }}
            />
          ) : null}

          {visibility.services ? (
            <AttentionGroup
              title="Services"
              href={`${BASE}/services/requests`}
              sectionId="services"
              tone="pending"
              order={5}
              badge={
                pendingServiceCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-[var(--status-pending-fg)]">
                    <span aria-hidden className="size-1.5 rounded-full bg-current" />
                    {pendingServiceCount} pending
                  </span>
                ) : null
              }
              items={serviceItems}
              emptyMessage="No pending add-on services or work orders."
              keyForItem={(item) => item.id}
              renderRow={(item) => (
                <IssueRow
                  href={`${BASE}/services/requests`}
                  dot={DOT_PENDING}
                  title={item.title}
                  subtitle={item.subtitle}
                  pill={<StatusPill tone="pending">Pending</StatusPill>}
                  dataAttr="dashboard-attention-service"
                />
              )}
            />
          ) : null}

          {visibility.inbox ? (
            <AttentionGroup
              title="Inbox"
              href={`${BASE}/communication/inbox/unopened`}
              sectionId="inbox"
              tone="info"
              order={6}
              items={inboxThreads}
              emptyMessage="No unread messages. Inbox is clear."
              keyForItem={(thread) => thread.id}
              renderRow={(thread) => (
                <IssueRow
                  href={`${BASE}/communication/inbox/unopened`}
                  dot={DOT_INFO}
                  title={thread.from || "Unknown sender"}
                  subtitle={thread.subject || thread.preview || "—"}
                  pill={<StatusPill tone="info">Unread</StatusPill>}
                  dataAttr="dashboard-attention-inbox"
                />
              )}
            />
          ) : null}

          {!anyAttentionVisible ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
              <p className="text-sm text-muted">All attention sections are hidden.</p>
              <button
                type="button"
                onClick={() => setCustomizeOpen(true)}
                className="mt-1 text-xs font-semibold text-primary hover:underline underline-offset-2"
              >
                Customize your dashboard →
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <DashboardCustomizeModal
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        visibility={visibility}
        onToggle={setVisible}
        onReset={reset}
      />
    </ManagerPortalPageShell>
  );
}
