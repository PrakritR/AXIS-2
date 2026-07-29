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
import { MonthlyProfitChart } from "@/components/portal/monthly-profit-chart";
import {
  applicationVisibleToPortalUser,
  collectLinkedPropertyIdsForModule,
  moduleRowVisibleToPortalUser,
} from "@/lib/manager-portfolio-access";
import {
  bucketByMonth,
  lastNMonths,
  mergeMonthlyCashflow,
  parseMoneyLabel,
} from "@/lib/portal-monthly-profit";
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
  PortalDashboardKpiRow,
  PortalDashboardKpiTile,
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
import { useAgentPendingActions } from "@/hooks/use-agent-pending-actions";
import {
  pendingActionChipContent,
  type PendingActionListItem,
} from "@/lib/axis-assistant/pending-action-display";
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
  // Floor at every unit so a label never overstates elapsed/remaining time
  // (1h31m reads "in 1h", not "in 2h").
  const min = Math.floor(abs / 60000);
  if (min < 1) return "now";
  const suffix = (n: number, unit: string) => (past ? `${n}${unit} ago` : `in ${n}${unit}`);
  if (min < 60) return suffix(min, "m");
  const hr = Math.floor(min / 60);
  if (hr < 24) return suffix(hr, "h");
  const day = Math.floor(hr / 24);
  if (day < 7) return suffix(day, "d");
  const wk = Math.floor(day / 7);
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

/**
 * The "AI drafts" attention group: assistant-proposed write actions the manager
 * can approve or discard inline. Approve/Discard route through the SAME gated
 * confirm path used by the assistant chat (the server's `claimPendingAction`
 * re-validates the stored input and runs the handler) — this row is presentation
 * only. It never executes a write client-side and never bypasses the
 * preview/confirm gate. Collapsible like every other attention group.
 */
function AiDraftsGroup({
  items,
  order = 0,
  resolvingId,
  onResolve,
}: {
  items: PendingActionListItem[];
  order?: number;
  resolvingId: string | null;
  onResolve: (
    id: string,
    decision: "confirm" | "deny",
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const accent = ATTENTION_TONE.info;
  const [override, setOverride] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = override ?? true;
  const count = items.length;

  const handle = async (id: string, decision: "confirm" | "deny") => {
    setError(null);
    const res = await onResolve(id, decision);
    if (!res.ok && res.error) setError(res.error);
  };

  return (
    <div
      className="pl-attn-enter overflow-hidden rounded-lg border border-border bg-card"
      style={{
        animationDelay: `${Math.min(order, 8) * 55}ms`,
        borderLeftWidth: 3,
        borderLeftColor: accent.fg,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        data-attr="dashboard-attention-toggle-aiDrafts"
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
          style={{ color: accent.fg }}
        >
          AI drafts
        </h3>
        <span
          className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
          style={{ background: accent.bg, color: accent.fg }}
        >
          {count}
        </span>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-primary [html[data-native]_&]:text-xs">
          <span aria-hidden className="text-sm leading-none">
            ✦
          </span>
          Pending approval
        </span>
      </div>
      {open ? (
        <div className="border-t border-border">
          <div className="divide-y divide-border">
            {items.map((item) => {
              const { title, subtitle } = pendingActionChipContent(item);
              const busy = resolvingId === item.id;
              return (
                <div
                  key={item.id}
                  data-attr="dashboard-attention-ai-draft"
                  className="flex items-center gap-3 px-3.5 py-2.5 [html[data-native]_&]:gap-2 [html[data-native]_&]:px-3 [html[data-native]_&]:py-2"
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: DOT_INFO }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground [html[data-native]_&]:text-[13px]">
                      {title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted [html[data-native]_&]:text-[11px]">
                      {subtitle}
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handle(item.id, "confirm")}
                      data-attr="dashboard-ai-draft-approve"
                      className="rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-white outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50"
                    >
                      {busy ? "…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handle(item.id, "deny")}
                      data-attr="dashboard-ai-draft-discard"
                      className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-muted outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-50"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {error ? (
            <p className="border-t border-border px-3.5 py-2 text-xs text-danger [html[data-native]_&]:px-3">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function fmt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "soon";
  return formatPacificDateTime(d);
}


function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function ManagerDashboard({ displayName = "there" }: { displayName?: string }) {
  const { userId, ready: authReady } = useManagerUserId();
  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);
  // `nowMs` is frozen for the whole session: it only feeds the 6-month cash-flow
  // buckets in the heavy `data` memo, where a boundary stale by minutes is fine.
  const [nowMs] = useState(() => Date.now());
  // `nowTick` is a SEPARATE, lightweight clock that ticks every minute and is
  // used ONLY for the live relative timestamps (tour rows). Keeping it out of the
  // `data` memo deps means the minute tick refreshes the labels without re-running
  // the dashboard's store reads/filters/sorts.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);
  const [docExpirySummary, setDocExpirySummary] = useState<DocumentExpirationSummary | null>(null);
  const { visibility, setVisible, reset } = useDashboardVisibility(userId);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // The assistant dock + AI-draft chips are live, auth-gated manager surfaces:
  // off in the /demo sandbox (which uses its own scripted assistant and must
  // never hit the real, authenticated `/api/agent/*` routes) and until the
  // session is known.
  const assistantEnabled = authReady && !!userId && !isDemoModeActive();
  const {
    items: pendingDrafts,
    resolve: resolveDraft,
    resolvingId: resolvingDraftId,
  } = useAgentPendingActions({ enabled: assistantEnabled });

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
    const months = lastNMonths(nowMs, 24);
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
  const showAiDrafts = visibility.aiDrafts && pendingDrafts.length > 0;
  const openCount =
    (showAiDrafts ? pendingDrafts.length : 0) +
    (visibility.tours ? pendingTours.length : 0) +
    (visibility.applications ? pendingApps.length : 0) +
    (visibility.leases ? pendingLeaseRows.length : 0) +
    (visibility.payments ? pendingCharges.length : 0) +
    (visibility.services ? serviceItems.length : 0) +
    (visibility.inbox ? inboxThreads.length : 0);

  const anyAttentionVisible =
    visibility.aiDrafts ||
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
      welcomeSubtitle
    >
      {/* Full width: the assistant is the floating popup by default, and a
          manager who pins it gets the portal-wide rail from the shell layout
          (`PortalAssistantDockRail`) rather than a dashboard-only column.
          `min-w-0` keeps the horizontally-scrolling KPI row from forcing page
          overflow. */}
      <div className={`min-w-0 ${PORTAL_DASHBOARD_STACK}`}>
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
        <PortalDashboardKpiRow>
            <PortalDashboardKpiTile
              label="Rooms vacant"
              value={roomsVacant}
              tone={roomsVacant > 0 ? "warning" : "success"}
              emphasis={roomsVacant > 0}
              href={`${BASE}/properties`}
              dataAttr="dashboard-kpi-vacant"
            />
            <PortalDashboardKpiTile
              label="Leases to sign"
              value={pendingLeaseRows.length}
              tone="brand"
              emphasis={managerSignatureLeaseCount > 0 || pendingLeaseRows.length > 0}
              href={`${BASE}/leases`}
              dataAttr="dashboard-kpi-leases"
            />
            <PortalDashboardKpiTile
              label="Review"
              value={pendingApps.length}
              tone={pendingApps.length > 0 ? "warning" : "brand"}
              emphasis={pendingApps.length > 0}
              href={`${BASE}/applications`}
              dataAttr="dashboard-kpi-applications"
            />
            <PortalDashboardKpiTile
              label="Overdue"
              value={overdueBalanceLabel}
              tone={overdueChargeCount > 0 ? "danger" : "success"}
              emphasis={overdueChargeCount > 0}
              href={`${BASE}/payments`}
              dataAttr="dashboard-kpi-overdue"
            />
            <PortalDashboardKpiTile
              label="Services"
              value={serviceItems.length}
              tone={serviceItems.length > 0 ? "warning" : "neutral"}
              emphasis={serviceItems.length > 0}
              href={`${BASE}/services/requests`}
              dataAttr="dashboard-kpi-services"
            />
            <PortalDashboardKpiTile
              label="Messages to read"
              value={inboxThreads.length}
              tone={inboxThreads.length > 0 ? "brand" : "neutral"}
              emphasis={inboxThreads.length > 0}
              href={`${BASE}/communication/inbox/unopened`}
              dataAttr="dashboard-kpi-messages"
            />
        </PortalDashboardKpiRow>

        {/* Financial trend graphs — payments collected vs. expenses, last 6 months. */}
        {visibility.cashflow ? (
          <MonthlyProfitChart points={mergeMonthlyCashflow(paymentsByMonth, expensesByMonth)} />
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

          {showAiDrafts ? (
            <AiDraftsGroup
              items={pendingDrafts}
              order={0}
              resolvingId={resolvingDraftId}
              onResolve={resolveDraft}
            />
          ) : null}

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
                  meta={[fmt(tour.start), relativeFromNow(tour.start, nowTick)].filter(Boolean).join(" · ")}
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
              title="Communication"
              href={`${BASE}/communication/inbox/unopened`}
              sectionId="inbox"
              tone="info"
              order={6}
              items={inboxThreads}
              emptyMessage="No unread messages. Communication is clear."
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
