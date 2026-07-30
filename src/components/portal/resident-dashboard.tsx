"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { DashboardCustomizeModal } from "@/components/portal/dashboard-customize-modal";
import {
  ManagerPortalPageShell,
  PORTAL_DASHBOARD_STACK,
  PortalDashboardKpiRow,
  PortalDashboardKpiTile,
  formatCompactChargeLine,
} from "@/components/portal/portal-metrics";
import {
  PortalTableExpandChevron,
  isPortalRowClickIgnored,
  usePortalPreviewSlice,
} from "@/components/portal/portal-data-table";
import { useIsNativeApp } from "@/hooks/use-is-native-app";
import { useResidentDashboardVisibility } from "@/hooks/use-resident-dashboard-visibility";
import { RESIDENT_DASHBOARD_SECTIONS } from "@/lib/resident-dashboard-preferences";
import { RESIDENT_INBOX_THREAD_FALLBACK } from "@/components/portal/resident-inbox-panel";
import { usePortalSession } from "@/hooks/use-portal-session";
import {
  chargeDueLabel,
  HOUSEHOLD_CHARGES_EVENT,
  isHouseholdChargeOverdue,
  readChargesForResident,
  syncHouseholdChargesFromServer,
} from "@/lib/household-charges";
import {
  LEASE_PIPELINE_EVENT,
  findLeaseForResidentEmail,
  residentCanViewLeaseRow,
  syncLeasePipelineFromServer,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";
import {
  MANAGER_APPLICATIONS_EVENT,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import { getPropertyById, getRoomChoiceLabel } from "@/lib/rental-application/data";
import { applicationsForResidentEmail } from "@/lib/rental-application/application-policy";
import {
  applicationStageDisplayLabel,
  INCOMPLETE_APPLICATION_LABEL,
  isInProgressApplicationRow,
} from "@/lib/rental-application/in-progress-application";
import {
  MANAGER_WORK_ORDERS_EVENT,
  readManagerWorkOrderRows,
  syncManagerWorkOrdersFromServer,
} from "@/lib/manager-work-orders-storage";
import {
  readServiceRequestsForResident,
  SERVICE_REQUESTS_EVENT,
  syncServiceRequestsFromServer,
} from "@/lib/service-requests-storage";
import type { DemoApplicantRow, DemoManagerWorkOrderRow } from "@/data/demo-portal";
import type { ServiceRequest } from "@/lib/service-requests-storage";
import {
  countUnopenedPersistedInbox,
  loadPersistedInbox,
  PORTAL_INBOX_CHANGED_EVENT,
  RESIDENT_INBOX_STORAGE_KEY,
  syncPersistedInboxFromServer,
} from "@/lib/portal-inbox-storage";

const BASE = "/resident";

/** Semantic status foreground tokens for the leading issue-row dots. */
const DOT_CONFIRMED = "var(--status-confirmed-fg)";

type AppStatus = "pending" | "approved" | "rejected";

type PillTone = "pending" | "success" | "danger" | "info" | "neutral";

type AttentionTone = "pending" | "success" | "danger" | "info";
const ATTENTION_TONE: Record<AttentionTone, { fg: string; bg: string }> = {
  danger: { fg: "var(--status-overdue-fg)", bg: "var(--status-overdue-bg)" },
  pending: { fg: "var(--status-pending-fg)", bg: "var(--status-pending-bg)" },
  info: { fg: "var(--status-approved-fg)", bg: "var(--status-approved-bg)" },
  success: { fg: "var(--status-confirmed-fg)", bg: "var(--status-confirmed-bg)" },
};

function sectionAccentDot(tone: AttentionTone): string {
  return ATTENTION_TONE[tone].fg;
}

type ResidentDashboardSectionId =
  | "payments"
  | "lease"
  | "applications"
  | "services"
  | "communication";

/** Small theme-aware status pill (light/dark flip via `.portal-badge-*`). */
function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  if (tone === "neutral") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-border bg-[var(--secondary)] px-2 py-0.5 text-[10px] font-semibold text-muted [html[data-native]_&]:text-[9px]">
        {children}
      </span>
    );
  }
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
      className="group flex items-center gap-3 px-3.5 py-2.5 transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--attn-section-bg)_40%,transparent)] [html[data-native]_&]:gap-2.5 [html[data-native]_&]:px-3 [html[data-native]_&]:py-2"
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
 * One "Needs attention" group — collapsible card with status rail, matching the
 * manager dashboard. Opens by default only when it has items.
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
  sectionId: ResidentDashboardSectionId;
  tone: AttentionTone;
  order?: number;
  badge?: ReactNode;
  items: T[];
  emptyMessage: string;
  keyForItem: (item: T) => string;
  renderRow: (item: T, sectionTone: AttentionTone) => ReactNode;
}) {
  const { visible, overflow } = usePortalPreviewSlice(items);
  const { isNative } = useIsNativeApp();
  const count = items.length;
  const isEmpty = count === 0;
  const accent = ATTENTION_TONE[tone];
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? !isEmpty;

  return (
    <div
      className="pl-attn-enter overflow-hidden rounded-xl border border-border bg-card"
      style={{
        animationDelay: `${Math.min(order, 8) * 55}ms`,
        borderLeftWidth: isEmpty ? undefined : 3,
        borderLeftColor: isEmpty ? undefined : accent.fg,
        background: isEmpty ? undefined : `color-mix(in srgb, ${accent.bg} 32%, var(--card))`,
        ["--attn-section-bg" as string]: accent.bg,
        ["--attn-section-fg" as string]: accent.fg,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        data-attr={`resident-dashboard-attention-toggle-${sectionId}`}
        onClick={() => setOverride(!open)}
        onKeyDown={(e) => {
          if (isPortalRowClickIgnored(e.target)) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOverride(!open);
          }
        }}
        className="flex cursor-pointer items-center gap-2 px-3.5 py-2.5 transition-colors hover:bg-[color-mix(in_srgb,var(--attn-section-bg)_45%,transparent)] [html[data-native]_&]:px-3 [html[data-native]_&]:py-2"
      >
        <PortalTableExpandChevron expanded={open} />
        <h3
          className="min-w-0 text-sm font-semibold tracking-[-0.01em] [html[data-native]_&]:text-[13px] [html[data-native]_&]:leading-snug"
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
          data-attr="resident-dashboard-attention-link"
          className="ml-auto shrink-0 whitespace-nowrap text-xs font-semibold hover:underline underline-offset-2 [html[data-native]_&]:text-sm"
          style={{ color: isEmpty ? "var(--muted)" : accent.fg }}
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
            <div className="divide-y divide-border/80">
              {visible.map((item) => (
                <Fragment key={keyForItem(item)}>{renderRow(item, tone)}</Fragment>
              ))}
            </div>
            {overflow > 0 ? (
              <div className="border-t border-border/80 px-3.5 py-2 [html[data-native]_&]:px-3">
                <Link
                  href={href}
                  className="inline-block text-xs font-semibold hover:underline underline-offset-2"
                  style={{ color: accent.fg }}
                >
                  {isNative ? `View all (${count}) →` : `View all ${count} →`}
                </Link>
              </div>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
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

function leaseBadge(row: LeasePipelineRow | null, approved: boolean): {
  label: string;
  tone: "emerald" | "amber" | "sky" | "slate" | "blue";
  cta: boolean;
} {
  if (!approved || !row) return { label: "Not started", tone: "slate", cta: false };
  if (!residentCanViewLeaseRow(row)) {
    if (row.status === "Voided") return { label: "Voided", tone: "slate", cta: false };
    return { label: "Being prepared", tone: "slate", cta: false };
  }
  switch (row.status) {
    case "Fully Signed": return { label: "Active ✓", tone: "emerald", cta: false };
    case "Resident Signature Pending": return { label: "Sign now", tone: "blue", cta: true };
    case "Manager Signature Pending": return { label: "Awaiting manager", tone: "sky", cta: false };
    default: return { label: row.status || "In progress", tone: "amber", cta: false };
  }
}

/** Map the legacy badge tone palette onto the shared status-pill tones. */
function pillToneForBadgeTone(tone: string): PillTone {
  switch (tone) {
    case "emerald": return "success";
    case "rose": return "danger";
    case "sky":
    case "blue": return "info";
    case "slate": return "neutral";
    default: return "pending";
  }
}

function applicationStatusBadge(row: DemoApplicantRow): { label: string; tone: "emerald" | "amber" | "rose" | "slate" } {
  if (row.bucket === "approved") return { label: "Approved", tone: "emerald" };
  if (row.bucket === "rejected") return { label: "Rejected", tone: "rose" };
  if (isInProgressApplicationRow(row)) return { label: INCOMPLETE_APPLICATION_LABEL, tone: "amber" };
  return { label: row.stage?.trim() || "Pending", tone: "amber" };
}

function applicationSubtitle(row: DemoApplicantRow): string {
  const property = row.property?.trim() || row.application?.propertyId?.trim() || "";
  const stage = applicationStageDisplayLabel(row);
  if (property && stage) return `${property} · ${stage}`;
  return property || stage || "Application";
}

type ServicePreviewItem =
  | { kind: "request"; id: string; row: ServiceRequest }
  | { kind: "work-order"; id: string; row: DemoManagerWorkOrderRow };

function servicePreviewItems(
  requests: ServiceRequest[],
  workOrders: DemoManagerWorkOrderRow[],
): ServicePreviewItem[] {
  const items: ServicePreviewItem[] = [];
  for (const row of requests.filter((r) => r.status === "pending" || r.status === "approved")) {
    items.push({ kind: "request", id: `req-${row.id}`, row });
  }
  for (const row of workOrders.filter((r) => r.bucket === "open" || r.bucket === "scheduled")) {
    items.push({ kind: "work-order", id: `wo-${row.id}`, row });
  }
  return items;
}

export function ResidentDashboard({
  applicationApproved = false,
  initialApplicationId = null,
  displayName = "Resident",
  residentEmail = "",
  residentUserId = null,
  managerSubscriptionTier = null,
}: {
  applicationApproved?: boolean;
  initialApplicationId?: string | null;
  displayName?: string;
  residentEmail?: string;
  residentUserId?: string | null;
  managerSubscriptionTier?: "free" | "paid" | null;
}) {
  void initialApplicationId;
  void managerSubscriptionTier;
  const initialEmail = residentEmail.trim().toLowerCase();
  const session = usePortalSession({ userId: residentUserId, email: initialEmail || null });
  const email = session.email?.trim().toLowerCase() || initialEmail;
  const canUseFullPortal = applicationApproved;
  const userId = session.userId ?? residentUserId;
  const { visibility, setVisible, reset } = useResidentDashboardVisibility(userId);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const [appStatus, setAppStatus] = useState<AppStatus>(applicationApproved ? "approved" : "pending");
  const [appProperty, setAppProperty] = useState<string | null>(null);
  const [appRoom, setAppRoom] = useState<string | null>(null);

  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setClientReady(true));
  }, []);

  useEffect(() => {
    void Promise.allSettled([
      syncManagerApplicationsFromServer({ force: true }),
      syncLeasePipelineFromServer(),
      syncManagerWorkOrdersFromServer(),
      syncServiceRequestsFromServer({ force: true }),
      syncPersistedInboxFromServer(RESIDENT_INBOX_STORAGE_KEY),
      syncHouseholdChargesFromServer(false, { skipReconcile: true }),
    ]).then(bump);
    window.addEventListener(LEASE_PIPELINE_EVENT, bump);
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
    window.addEventListener(SERVICE_REQUESTS_EVENT, bump);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, bump);
    window.addEventListener("storage", bump);
    const onInbox = (e: Event) => {
      const key = (e as CustomEvent<{ key?: string }>).detail?.key;
      if (!key || key === RESIDENT_INBOX_STORAGE_KEY) bump();
    };
    window.addEventListener(PORTAL_INBOX_CHANGED_EVENT, onInbox as EventListener);
    return () => {
      window.removeEventListener(LEASE_PIPELINE_EVENT, bump);
      window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
      window.removeEventListener(SERVICE_REQUESTS_EVENT, bump);
      window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, bump);
      window.removeEventListener("storage", bump);
      window.removeEventListener(PORTAL_INBOX_CHANGED_EVENT, onInbox as EventListener);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const apply = () => {
      const rows = readManagerApplicationRows();
      const row = email ? rows.find((r) => r.email?.trim().toLowerCase() === email) : undefined;
      if (!alive) return;
      if (row?.bucket === "approved" || row?.bucket === "rejected" || row?.bucket === "pending") {
        const resolvedProperty = (() => {
          const assignedPropertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim();
          if (assignedPropertyId) {
            const p = getPropertyById(assignedPropertyId);
            if (p) {
              const street = p.address.split(",")[0]?.trim();
              return street || p.buildingName || p.title || null;
            }
          }
          const fallback = row.property?.trim() || null;
          if (!fallback) return null;
          return fallback.split("·")[0]?.trim() || fallback;
        })();

        const resolvedRoom = (() => {
          const roomChoice = row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "";
          if (!roomChoice) return null;
          const roomLabel = getRoomChoiceLabel(roomChoice).trim();
          if (!roomLabel) return null;
          return roomLabel.split(" · ")[0]?.trim() || roomLabel;
        })();

        const finalBucket = applicationApproved && row.bucket === "pending" ? "approved" : row.bucket;
        setAppStatus(finalBucket);
        setAppProperty(resolvedProperty);
        setAppRoom(resolvedRoom);
      } else {
        setAppStatus("pending");
        setAppProperty(null);
        setAppRoom(null);
      }
    };
    apply();
    void syncManagerApplicationsFromServer({ force: true }).then(() => { if (alive) apply(); });
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, apply);
    window.addEventListener("storage", apply);
    return () => {
      alive = false;
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, apply);
      window.removeEventListener("storage", apply);
    };
  }, [applicationApproved, email]);

  const data = useMemo(() => {
    void tick;
    if (!clientReady) {
      return {
        leaseRow: null,
        lease: leaseBadge(null, appStatus === "approved"),
        inbox: 0,
        inboxThreads: [] as ReturnType<typeof loadPersistedInbox>,
        pendingCharges: [] as ReturnType<typeof readChargesForResident>,
        applicationRows: [] as ReturnType<typeof applicationsForResidentEmail>,
        workOrders: [] as DemoManagerWorkOrderRow[],
        serviceRequests: [] as ServiceRequest[],
        serviceItems: [] as ServicePreviewItem[],
        openWorkOrderCount: 0,
        scheduledWorkOrderCount: 0,
        pendingRequestCount: 0,
        approvedRequestCount: 0,
      };
    }

    const leaseRow = email ? findLeaseForResidentEmail(email) : null;
    const lease = leaseBadge(leaseRow, appStatus === "approved");

    const workOrders = email
      ? readManagerWorkOrderRows().filter(
          (r) =>
            r.residentEmail?.trim().toLowerCase() === email &&
            (r as { requestType?: string }).requestType !== "service",
        )
      : [];
    const openWorkOrderCount = workOrders.filter((r) => r.bucket === "open").length;
    const scheduledWorkOrderCount = workOrders.filter((r) => r.bucket === "scheduled").length;

    const serviceRequests = email ? readServiceRequestsForResident(email) : [];
    const pendingRequestCount = serviceRequests.filter((r) => r.status === "pending").length;
    const approvedRequestCount = serviceRequests.filter((r) => r.status === "approved").length;
    const serviceItems = servicePreviewItems(serviceRequests, workOrders);

    const inboxThreads = loadPersistedInbox(RESIDENT_INBOX_STORAGE_KEY, RESIDENT_INBOX_THREAD_FALLBACK)
      .filter((t) => t.folder === "inbox" && t.unread)
      .slice(0, 5);
    const inbox = countUnopenedPersistedInbox(RESIDENT_INBOX_STORAGE_KEY, RESIDENT_INBOX_THREAD_FALLBACK);

    const charges = email ? readChargesForResident(email, residentUserId) : [];
    const pendingCharges = charges
      .filter((c) => c.status === "pending")
      .sort((a, b) => {
        const aOverdue = isHouseholdChargeOverdue(a);
        const bOverdue = isHouseholdChargeOverdue(b);
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        return 0;
      });
    return {
      leaseRow,
      lease,
      inbox,
      inboxThreads,
      pendingCharges,
      applicationRows: email ? applicationsForResidentEmail(email) : [],
      workOrders,
      serviceRequests,
      serviceItems,
      openWorkOrderCount,
      scheduledWorkOrderCount,
      pendingRequestCount,
      approvedRequestCount,
    };
  }, [tick, email, appStatus, residentUserId, clientReady]);

  const {
    leaseRow,
    lease,
    inbox,
    inboxThreads,
    pendingCharges,
    applicationRows,
    serviceItems,
    openWorkOrderCount,
    scheduledWorkOrderCount,
    pendingRequestCount,
    approvedRequestCount,
  } = data;
  const pendingApplicationCount = applicationRows.filter((r) => r.bucket === "pending").length;
  const approvedApplicationCount = applicationRows.filter((r) => r.bucket === "approved").length;

  const welcomeName =
    displayName && displayName !== "Resident" ? displayName.split(/\s+/)[0] : null;
  void welcomeName;

  const communicationHref = `${BASE}/communication`;
  const overdueChargeCount = pendingCharges.filter((c) => isHouseholdChargeOverdue(c)).length;
  const totalBalanceDue = pendingCharges.reduce((sum, c) => sum + parseMoneyLabel(c.balanceLabel), 0);


  const servicesHref = canUseFullPortal ? `${BASE}/services/requests` : `${BASE}/services`;
  const leaseUnlocked = appStatus === "approved";
  const leaseItems = leaseUnlocked && leaseRow ? [leaseRow] : [];
  const leaseDateRange = leaseRow?.application?.leaseStart
    ? `${leaseRow.application.leaseStart}${leaseRow.application.leaseEnd ? ` → ${leaseRow.application.leaseEnd}` : ""}`
    : null;
  const leaseSubtitle =
    leaseDateRange ||
    leaseRow?.unit ||
    (appProperty ? `${appProperty}${appRoom ? ` · ${appRoom}` : ""}` : undefined);
  const leaseEmptyMessage = !leaseUnlocked
    ? "Available after your application is approved."
    : appProperty
      ? `${appProperty}${appRoom ? ` · ${appRoom}` : ""}. Lease not started yet.`
      : "No lease on file yet.";

  const openServiceCount = canUseFullPortal ? serviceItems.length : 0;
  const openCount =
    (visibility.payments ? pendingCharges.length : 0) +
    (visibility.services && canUseFullPortal ? openServiceCount : 0) +
    (visibility.communication ? inboxThreads.length : 0) +
    (visibility.applications ? pendingApplicationCount : 0) +
    (visibility.lease && lease.cta ? 1 : 0);

  return (
    <ManagerPortalPageShell
      title="Dashboard"
      hideTitleOnNative
      hideTitleOnMobileNav
    >
      <div className={`min-w-0 ${PORTAL_DASHBOARD_STACK}`}>
        <PortalDashboardKpiRow>
            <PortalDashboardKpiTile
              label="Balance due"
              value={formatUsd(totalBalanceDue)}
              tone={overdueChargeCount > 0 ? "danger" : totalBalanceDue > 0 ? "warning" : "success"}
              emphasis={overdueChargeCount > 0 || totalBalanceDue > 0}
              href={`${BASE}/payments`}
              dataAttr="resident-dashboard-kpi-balance"
            />
            {canUseFullPortal ? (
            <PortalDashboardKpiTile
              label="Services"
              value={openServiceCount}
              tone={openServiceCount > 0 ? "warning" : "neutral"}
              emphasis={openServiceCount > 0}
              href={servicesHref}
              dataAttr="resident-dashboard-kpi-services"
            />
            ) : null}
            <PortalDashboardKpiTile
              label="Unread messages"
              value={inbox}
              tone={inbox > 0 ? "brand" : "neutral"}
              emphasis={inbox > 0}
              href={communicationHref}
              dataAttr="resident-dashboard-kpi-inbox"
            />
        </PortalDashboardKpiRow>

        {/* Needs attention — dense issue rows grouped under tiny uppercase labels. */}
        <div className="space-y-4 [html[data-native]_&]:space-y-3">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="text-primary text-xl leading-none [html[data-native]_&]:text-lg">
              ✦
            </span>
            <h2 className="text-xl font-bold leading-tight tracking-[-0.02em] text-foreground [html[data-native]_&]:text-lg">
              Needs attention
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
              data-attr="resident-dashboard-customize-open"
              className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              <span className="[html[data-native]_&]:sr-only">Customize</span>
            </button>
          </div>

          {visibility.payments ? (
          <AttentionGroup
            title="Pending & overdue payments"
            href={`${BASE}/payments`}
            sectionId="payments"
            tone={overdueChargeCount > 0 ? "danger" : "pending"}
            order={0}
            badge={
              overdueChargeCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-[var(--status-overdue-fg)]">
                  <span aria-hidden className="size-1.5 rounded-full bg-current" />
                  {overdueChargeCount} overdue
                </span>
              ) : null
            }
            items={pendingCharges}
            emptyMessage="No outstanding charges."
            keyForItem={(charge) => charge.id}
            renderRow={(charge, sectionTone) => {
              const overdue = isHouseholdChargeOverdue(charge);
              return (
                <IssueRow
                  href={`${BASE}/payments`}
                  dot={sectionAccentDot(sectionTone)}
                  title={charge.title || "Charge"}
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
                  dataAttr="resident-dashboard-attention-payment"
                />
              );
            }}
          />
          ) : null}

          {visibility.lease ? (
          <AttentionGroup
            title="Lease"
            href={`${BASE}/lease`}
            sectionId="lease"
            tone={lease.cta ? "info" : "pending"}
            order={1}
            items={leaseItems}
            emptyMessage={leaseEmptyMessage}
            keyForItem={(row) => row.id}
            renderRow={(_row, sectionTone) => (
              <IssueRow
                href={`${BASE}/lease`}
                dot={sectionAccentDot(sectionTone)}
                title={lease.cta ? "Signature needed" : lease.tone === "emerald" ? "Lease active" : "Lease status"}
                subtitle={leaseSubtitle}
                meta={leaseRow?.signedRentLabel}
                pill={<StatusPill tone={pillToneForBadgeTone(lease.tone)}>{lease.label}</StatusPill>}
                dataAttr="resident-dashboard-attention-lease"
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
            order={2}
            badge={
              pendingApplicationCount > 0 || approvedApplicationCount > 0 ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  {pendingApplicationCount > 0 ? (
                    <StatusPill tone="pending">{pendingApplicationCount} pending</StatusPill>
                  ) : null}
                  {approvedApplicationCount > 0 ? (
                    <StatusPill tone="success">{approvedApplicationCount} approved</StatusPill>
                  ) : null}
                </span>
              ) : null
            }
            items={applicationRows}
            emptyMessage="No applications yet. Start your first application."
            keyForItem={(row) => row.id}
            renderRow={(row, sectionTone) => {
              const badge = applicationStatusBadge(row);
              return (
                <IssueRow
                  href={`${BASE}/applications`}
                  dot={sectionAccentDot(sectionTone)}
                  title={row.name?.trim() || "Application"}
                  subtitle={applicationSubtitle(row)}
                  pill={<StatusPill tone={pillToneForBadgeTone(badge.tone)}>{badge.label}</StatusPill>}
                  dataAttr="resident-dashboard-attention-application"
                />
              );
            }}
          />
          ) : null}

          {canUseFullPortal && visibility.services ? (
          <AttentionGroup
            title="Services"
            href={servicesHref}
            sectionId="services"
            tone="pending"
            order={3}
            badge={
              openWorkOrderCount > 0 ||
                scheduledWorkOrderCount > 0 ||
                pendingRequestCount > 0 ||
                approvedRequestCount > 0 ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  {openWorkOrderCount > 0 ? (
                    <StatusPill tone="pending">{openWorkOrderCount} open</StatusPill>
                  ) : null}
                  {scheduledWorkOrderCount > 0 ? (
                    <StatusPill tone="info">{scheduledWorkOrderCount} scheduled</StatusPill>
                  ) : null}
                  {pendingRequestCount > 0 ? (
                    <StatusPill tone="pending">
                      {pendingRequestCount} add-on service{pendingRequestCount === 1 ? "" : "s"}
                    </StatusPill>
                  ) : null}
                </span>
              ) : null
            }
            items={serviceItems}
            emptyMessage="No open work orders or pending add-on services."
            keyForItem={(item) => item.id}
            renderRow={(item, sectionTone) => {
              if (item.kind === "request") {
                const approved = item.row.status === "approved";
                const propertyName = getPropertyById(item.row.propertyId)?.buildingName?.trim() || "";
                return (
                  <IssueRow
                    href={servicesHref}
                    dot={sectionAccentDot(sectionTone)}
                    title={item.row.offerName?.trim() || "Add-on service"}
                    subtitle={propertyName || "Add-on service"}
                    pill={
                      <StatusPill tone={approved ? "success" : "pending"}>
                        {approved ? "Approved" : "Pending"}
                      </StatusPill>
                    }
                    dataAttr="resident-dashboard-attention-service"
                  />
                );
              }
              const scheduled = item.row.bucket === "scheduled";
              return (
                <IssueRow
                  href={`${BASE}/services/work-orders`}
                  dot={sectionAccentDot(sectionTone)}
                  title={item.row.title?.trim() || "Work order"}
                  subtitle={[item.row.propertyName, item.row.unit].filter(Boolean).join(" · ") || "Maintenance"}
                  pill={
                    <StatusPill tone={scheduled ? "info" : "pending"}>
                      {scheduled ? "Scheduled" : "Open"}
                    </StatusPill>
                  }
                  dataAttr="resident-dashboard-attention-service"
                />
              );
            }}
          />
          ) : null}

          {visibility.communication ? (
          <AttentionGroup
            title="Communication"
            href={communicationHref}
            sectionId="communication"
            tone="info"
            order={4}
            badge={
              inbox > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-[var(--status-approved-fg)]">
                  <span aria-hidden className="size-1.5 rounded-full bg-current" />
                  {inbox} unread
                </span>
              ) : null
            }
            items={inboxThreads}
            emptyMessage="No unread messages. Communication is clear."
            keyForItem={(thread) => thread.id}
            renderRow={(thread, sectionTone) => (
              <IssueRow
                href={communicationHref}
                dot={sectionAccentDot(sectionTone)}
                title={thread.from || "Unknown sender"}
                subtitle={thread.subject || thread.preview || "—"}
                pill={<StatusPill tone="info">Unread</StatusPill>}
                dataAttr="resident-dashboard-attention-inbox"
              />
            )}
          />
          ) : null}
        </div>
      </div>

      <DashboardCustomizeModal
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        sections={RESIDENT_DASHBOARD_SECTIONS}
        visibility={visibility}
        onToggle={(id, visible) => setVisible(id as ResidentDashboardSectionId, visible)}
        onReset={reset}
      />
    </ManagerPortalPageShell>
  );
}
