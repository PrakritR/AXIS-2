"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { useIsNativeApp } from "@/hooks/use-is-native-app";
import {
  ManagerPortalPageShell,
  portalDashboardWelcomeSubtitle,
  PortalDashboardSectionHeader,
  PORTAL_DASHBOARD_STACK,
} from "@/components/portal/portal-metrics";
import {
  PortalPreviewOverflowLink,
  usePortalPreviewSlice,
} from "@/components/portal/portal-data-table";

/*
 * Owner dashboard — the "clarity" surface for a property OWNER (the person who
 * owns the rentals and hires a manager to run them day-to-day). It mirrors the
 * Linear layout of `manager-dashboard.tsx` (restrained KPI stat row + a dense
 * "Needs attention" list of issue rows), but reframed around owner concerns:
 * statements, distributions, occupancy, and messages from their manager.
 *
 * There is no dedicated owner PORTAL yet — the owner concept currently lives
 * server-side inside the manager's financials (`manager_property_owners`,
 * `manager_owner_distributions`, `/api/reports/owner-statement`). So this
 * component renders from an injected `data` prop and falls back to a clearly
 * marked placeholder set. When the owner portal + read API land, pass real
 * `OwnerDashboardData` and drop the placeholder.
 */

// -----------------------------------------------------------------------------
// Semantic status foreground tokens for the leading issue-row dots.
// -----------------------------------------------------------------------------
const DOT_OVERDUE = "var(--status-overdue-fg)";
const DOT_PENDING = "var(--status-pending-fg)";
const DOT_CONFIRMED = "var(--status-confirmed-fg)";
const DOT_INFO = "var(--status-approved-fg)";

// BASE placeholder path. TODO(owner-portal): repoint these at real `/owner/*`
// routes once the owner portal ships; today no such routes exist, so the links
// keep the layout honest without navigating anywhere meaningful.
const BASE = "/owner";

type PillTone = "pending" | "success" | "danger" | "info";

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
 * One "Needs attention" group: tiny uppercase label + section link, then a
 * hairline-bordered stack of dense issue rows (preview-sliced so native/mobile
 * row limits + overflow link behave like the manager dashboard).
 */
function AttentionGroup<T>({
  title,
  href,
  linkLabel,
  badge,
  items,
  emptyMessage,
  keyForItem,
  renderRow,
}: {
  title: string;
  href: string;
  linkLabel: string;
  badge?: ReactNode;
  items: T[];
  emptyMessage: string;
  keyForItem: (item: T) => string;
  renderRow: (item: T) => ReactNode;
}) {
  const { visible, overflow } = usePortalPreviewSlice(items);
  const { isNative } = useIsNativeApp();

  return (
    <div className="space-y-2 [html[data-native]_&]:space-y-1.5">
      <PortalDashboardSectionHeader title={title} href={href} linkLabel={linkLabel} badge={badge} />
      {items.length === 0 ? (
        <p className="text-sm text-muted [html[data-native]_&]:text-xs">{emptyMessage}</p>
      ) : (
        <>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {visible.map((item) => (
              <Fragment key={keyForItem(item)}>{renderRow(item)}</Fragment>
            ))}
          </div>
          <PortalPreviewOverflowLink
            overflow={overflow}
            href={href}
            label={isNative ? `View all (${items.length}) →` : undefined}
          />
        </>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Data model. Injected via props so the component wires up cleanly once a real
// owner read API exists; a placeholder set keeps it rendering today.
// -----------------------------------------------------------------------------

export type OwnerStatementRow = {
  id: string;
  /** e.g. "June 2026". */
  period: string;
  propertyName: string;
  /** Preformatted net-to-owner amount, e.g. "$4,120". */
  amountLabel: string;
  /** `true` once the owner has opened it. */
  viewed: boolean;
};

export type OwnerDistributionRow = {
  id: string;
  propertyName: string;
  amountLabel: string;
  /** Human date, e.g. "Jul 15". */
  dueLabel: string;
  status: "scheduled" | "processing";
};

export type OwnerVacancyRow = {
  id: string;
  propertyName: string;
  unit: string;
  /** e.g. "Vacant 12 days" or "Turn in progress". */
  statusLabel: string;
};

export type OwnerInboxRow = {
  id: string;
  from: string;
  subject: string;
};

export type OwnerDashboardData = {
  propertiesOwned: number;
  /** Preformatted gross portfolio income for the current month, e.g. "$18,400". */
  monthlyIncomeLabel: string;
  /** Preformatted distributions paid to the owner (period label lives in `sub`). */
  distributionsPaidLabel: string;
  /** Occupancy as a percentage string, e.g. "92%". */
  occupancyLabel: string;
  statements: OwnerStatementRow[];
  distributions: OwnerDistributionRow[];
  vacancies: OwnerVacancyRow[];
  inbox: OwnerInboxRow[];
};

/*
 * TODO(owner-data): replace with a real owner read source. Candidate wiring:
 *   - propertiesOwned / occupancy  → `manager_property_owners` + property/lease
 *     records scoped to this owner.
 *   - monthlyIncomeLabel           → income-statement query filtered to the
 *     owner's properties (`src/lib/reports/queries`).
 *   - distributions / distributionsPaidLabel → `manager_owner_distributions`
 *     (`/api/manager-owner-distributions`).
 *   - statements                   → `/api/reports/owner-statement`.
 *   - inbox                        → the shared portal inbox, scoped to the
 *     owner ↔ manager thread.
 * All figures MUST come from those tool/report return values, never recomputed
 * in the client (see AGENTS.md "Facts are tool-grounded").
 */
// Honest empty default. Real owner figures are tool-grounded (owner statements /
// distributions / property reads) and are not yet wired, so we show empty states
// and dashes rather than fabricated dollar amounts (AGENTS.md: "Facts are
// tool-grounded… never invent financial figures"). Pass a real `data` prop once
// the owner read API lands.
const EMPTY_OWNER_DATA: OwnerDashboardData = {
  propertiesOwned: 0,
  monthlyIncomeLabel: "—",
  distributionsPaidLabel: "—",
  occupancyLabel: "—",
  statements: [],
  distributions: [],
  vacancies: [],
  inbox: [],
};

export function OwnerDashboard({
  displayName = "there",
  data = EMPTY_OWNER_DATA,
}: {
  displayName?: string;
  data?: OwnerDashboardData;
}) {
  const { propertiesOwned, monthlyIncomeLabel, distributionsPaidLabel, occupancyLabel } = data;
  const { statements, distributions, vacancies, inbox } = data;

  const unviewedStatements = statements.filter((s) => !s.viewed);
  const vacancyCount = vacancies.length;
  const openCount =
    unviewedStatements.length + distributions.length + vacancyCount + inbox.length;

  return (
    <ManagerPortalPageShell
      title="Dashboard"
      subtitle={portalDashboardWelcomeSubtitle(displayName)}
      hideTitleOnNative
    >
      <div className={PORTAL_DASHBOARD_STACK}>
        {/* Command center — restrained KPI stat row (scrolls horizontally on narrow screens). */}
        <div className="-mx-1 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-2.5 [html[data-native]_&]:gap-2">
            <KpiTile
              label="Properties owned"
              value={propertiesOwned}
              href={`${BASE}/properties`}
              dataAttr="owner-dashboard-kpi-properties"
            />
            <KpiTile
              label="Portfolio income"
              value={monthlyIncomeLabel}
              sub="This month"
              href={`${BASE}/statements`}
              dataAttr="owner-dashboard-kpi-income"
            />
            <KpiTile
              label="Distributions paid"
              value={distributionsPaidLabel}
              sub="This month"
              href={`${BASE}/statements`}
              dataAttr="owner-dashboard-kpi-distributions"
            />
            <KpiTile
              label="Occupancy"
              value={occupancyLabel}
              sub={
                vacancyCount > 0
                  ? `${vacancyCount} ${vacancyCount === 1 ? "vacancy" : "vacancies"}`
                  : "Fully occupied"
              }
              accent={vacancyCount > 0}
              href={`${BASE}/properties`}
              dataAttr="owner-dashboard-kpi-occupancy"
            />
          </div>
        </div>

        {/* Needs attention — dense issue rows grouped under tiny uppercase labels. */}
        <div className="space-y-4 [html[data-native]_&]:space-y-3">
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-primary">
              ✦
            </span>
            <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">Needs attention</h2>
            {openCount > 0 ? (
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-[var(--secondary)] px-2.5 py-0.5 text-[11px] font-medium text-muted">
                <span aria-hidden className="size-1.5 rounded-full" style={{ background: DOT_CONFIRMED }} />
                {openCount} open
              </span>
            ) : null}
          </div>

          <AttentionGroup
            title="Statements ready"
            href={`${BASE}/statements`}
            linkLabel="Statements →"
            badge={
              unviewedStatements.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-[var(--status-approved-fg)]">
                  <span aria-hidden className="size-1.5 rounded-full bg-current" />
                  {unviewedStatements.length} new
                </span>
              ) : null
            }
            items={statements}
            emptyMessage="No statements yet — your manager posts one each period."
            keyForItem={(row: OwnerStatementRow) => row.id}
            renderRow={(row: OwnerStatementRow) => (
              <IssueRow
                href={`${BASE}/statements`}
                dot={row.viewed ? DOT_CONFIRMED : DOT_INFO}
                title={`${row.period} · ${row.propertyName}`}
                subtitle="Owner statement · net to you"
                meta={row.amountLabel}
                pill={
                  <StatusPill tone={row.viewed ? "success" : "info"}>
                    {row.viewed ? "Viewed" : "New"}
                  </StatusPill>
                }
                dataAttr="owner-dashboard-attention-statement"
              />
            )}
          />

          <AttentionGroup
            title="Upcoming distributions"
            href={`${BASE}/statements`}
            linkLabel="Distributions →"
            items={distributions}
            emptyMessage="No distributions scheduled right now."
            keyForItem={(row: OwnerDistributionRow) => row.id}
            renderRow={(row: OwnerDistributionRow) => (
              <IssueRow
                href={`${BASE}/statements`}
                dot={row.status === "processing" ? DOT_CONFIRMED : DOT_PENDING}
                title={row.propertyName}
                subtitle="Scheduled payout to your account"
                meta={`${row.amountLabel} · ${row.dueLabel}`}
                pill={
                  <StatusPill tone={row.status === "processing" ? "success" : "pending"}>
                    {row.status === "processing" ? "Processing" : "Scheduled"}
                  </StatusPill>
                }
                dataAttr="owner-dashboard-attention-distribution"
              />
            )}
          />

          <AttentionGroup
            title="Vacancies"
            href={`${BASE}/properties`}
            linkLabel="Properties →"
            badge={
              vacancyCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-[var(--status-overdue-fg)]">
                  <span aria-hidden className="size-1.5 rounded-full bg-current" />
                  {vacancyCount} vacant
                </span>
              ) : null
            }
            items={vacancies}
            emptyMessage="Every unit is occupied — nothing sitting empty."
            keyForItem={(row: OwnerVacancyRow) => row.id}
            renderRow={(row: OwnerVacancyRow) => (
              <IssueRow
                href={`${BASE}/properties`}
                dot={DOT_OVERDUE}
                title={row.propertyName}
                subtitle={row.unit}
                meta={row.statusLabel}
                pill={<StatusPill tone="danger">Vacant</StatusPill>}
                dataAttr="owner-dashboard-attention-vacancy"
              />
            )}
          />

          <AttentionGroup
            title="Inbox"
            href={`${BASE}/inbox`}
            linkLabel="Inbox →"
            items={inbox}
            emptyMessage="No unread messages — inbox is clear."
            keyForItem={(row: OwnerInboxRow) => row.id}
            renderRow={(row: OwnerInboxRow) => (
              <IssueRow
                href={`${BASE}/inbox`}
                dot={DOT_INFO}
                title={row.from}
                subtitle={row.subject}
                pill={<StatusPill tone="info">Unread</StatusPill>}
                dataAttr="owner-dashboard-attention-inbox"
              />
            )}
          />
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}
