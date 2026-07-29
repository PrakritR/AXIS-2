"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { FieldSingleSelect } from "@/components/ui/checkbox-multi-select";
import { Select } from "@/components/ui/input";
import { PortalPreviewOverflowLink, usePortalPreviewSlice } from "@/components/portal/portal-data-table";
import { formatCompactChargeLine, formatCompactPlacementLine } from "@/lib/portal-mobile-preview";
import { cn } from "@/lib/utils";
import { useIsNativeApp } from "@/hooks/use-is-native-app";

/** Dashboard / KPI link tiles (manager, resident, admin). */
export const PORTAL_DASHBOARD_TILE_LINK =
  "block rounded-xl border border-border bg-card px-5 py-4 shadow-[var(--shadow-sm)] transition-[border-color,box-shadow,transform] duration-200 hover:border-primary/30 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5 active:translate-y-0";

/** Outer card wrapping most portal sections (matches Properties / Managers shell). */
export const PORTAL_SECTION_SURFACE =
  "rounded-2xl border border-border bg-card p-4 text-foreground shadow-[var(--shadow-card)] backdrop-blur-[1px] max-lg:rounded-2xl max-lg:p-3 sm:rounded-[28px] sm:p-6 [html[data-native]_&]:px-3 [html[data-native]_&]:py-3";

/** Subtitle under the Dashboard heading — shared across all portal dashboards. */
export function portalDashboardWelcomeSubtitle(displayName?: string | null): string {
  const trimmed = displayName?.trim();
  return trimmed ? `Welcome, ${trimmed}` : "Welcome";
}

/** Calendar week grid outer frame (matches manager calendar chrome). */
export const PORTAL_CALENDAR_FRAME =
  "overflow-hidden rounded-2xl border border-border bg-accent/40 [html[data-theme=dark]_&]:portal-calendar-grid";

/** Pill toggles: Day / Week / Month (Managers filter style). */
export function PortalSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  optionDisabled,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  size?: "sm" | "md";
  /** When true, option is inactive (e.g. paid-only portal arm for Free tier). */
  optionDisabled?: (id: T) => boolean;
}) {
  const pad = size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm";
  return (
    <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-border bg-accent/30 p-1" role="tablist" aria-label="View">
      {options.map((opt) => {
        const disabled = optionDisabled?.(opt.id) ?? false;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={value === opt.id}
            disabled={disabled}
            onClick={() => {
              if (!disabled) onChange(opt.id);
            }}
            className={`min-h-9 rounded-full font-semibold transition-all duration-150 ${pad} ${
              disabled
                ? "cursor-not-allowed opacity-45"
                : value === opt.id
                  ? "bg-card text-foreground shadow-[var(--shadow-sm)]"
                  : "text-muted hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Primary page title in portal workspaces (aligned with Axis dashboard). */
export const PORTAL_PAGE_TITLE = "text-[2rem] font-semibold tracking-[-0.03em] text-foreground";

/** Matches admin Managers / Properties filter row (status + tier pill groups). */
export type PortalTierFilterId = "all" | "free" | "pro" | "business";

const TIER_FILTER_OPTIONS: { id: PortalTierFilterId; label: string }[] = [
  { id: "all", label: "All tiers" },
  { id: "free", label: "Free" },
  { id: "pro", label: "Pro" },
  { id: "business", label: "Business" },
];

export function PortalStatusTierFilterBar({
  statusTabs,
  activeStatusId,
  onStatusChange,
  tierFilter,
  onTierChange,
}: {
  statusTabs: { id: string; label: string; count: number }[];
  activeStatusId: string;
  onStatusChange: (id: string) => void;
  tierFilter: PortalTierFilterId;
  onTierChange: (id: PortalTierFilterId) => void;
}) {
  return (
    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-2xl border border-border bg-accent/30 p-1 sm:rounded-full">
        {statusTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onStatusChange(tab.id)}
            className={`flex min-h-9 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 ${
              activeStatusId === tab.id ? "bg-card text-foreground shadow-[var(--shadow-sm)]" : "text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                activeStatusId === tab.id ? "bg-accent text-foreground" : "bg-accent/50 text-muted"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <div className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-accent/30 p-1 sm:rounded-full">
        {TIER_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onTierChange(opt.id)}
            className={`min-h-9 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 ${
              tierFilter === opt.id ? "bg-card text-foreground shadow-[var(--shadow-sm)]" : "text-muted hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export type PortalMetricItem = {
  value: string;
  label: string;
};

/** Large value + muted label (Managers-style stat cards, not selectable). */
export function PortalStatRow({ items }: { items: PortalMetricItem[] }) {
  return (
    <div className="mt-5 flex flex-wrap gap-3">
      {items.map((k) => (
        <div
          key={k.label}
          className="min-w-[10rem] flex-1 rounded-2xl border border-border bg-accent/30 px-5 py-4 sm:min-w-[11rem] sm:flex-none"
        >
          <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{k.value}</p>
          <p className="mt-1 text-xs font-medium text-muted">{k.label}</p>
        </div>
      ))}
    </div>
  );
}

function tabButtonClass(active: boolean, textAlign: "center" | "left"): string {
  const align = textAlign === "center" ? "text-center" : "text-left";
  return [
    "min-w-[7.5rem] flex-1 basis-[7.5rem] rounded-xl border px-4 py-3 transition-colors duration-150 sm:flex-none sm:basis-auto",
    align,
    active
      ? "border-primary/30 bg-card shadow-[var(--shadow-sm)] ring-1 ring-border"
      : "border-border/60 bg-accent/30 hover:border-border hover:bg-card",
  ].join(" ");
}

/**
 * Selectable KPI tabs (Properties-style): number on top, label below, active = primary border + bottom bar.
 */
export function PortalKpiTabStrip({
  items,
  activeIndex,
  onSelect,
  textAlign = "center",
}: {
  items: PortalMetricItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  textAlign?: "center" | "left";
}) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {items.map((k, i) => {
        const active = i === activeIndex;
        return (
          <button key={k.label} type="button" onClick={() => onSelect(i)} className={tabButtonClass(active, textAlign)}>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{k.value}</p>
            <p className="mt-1 text-xs font-medium text-muted">{k.label}</p>
          </button>
        );
      })}
    </div>
  );
}

/** Inner well for tables / lists below KPI rows. */
export function PortalContentWell({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">{children}</div>
  );
}

/** Compact full-width select for mobile section status buckets (Current / Previous, etc.). */
export const PORTAL_MOBILE_STATUS_SELECT_CLASS =
  "h-9 w-auto max-w-[min(100%,18rem)] shrink-0 rounded-full border border-border bg-card px-2.5 pr-8 text-sm font-semibold text-foreground";

/** Mobile inline toolbar: status/tab dropdown + header actions on one row. */
export const PORTAL_MOBILE_TOOLBAR_ROW_CLASS =
  "flex w-full min-w-0 max-md:flex-nowrap max-md:items-center max-md:justify-between max-md:gap-2";

/** Admin portal pattern: pill strip with label + count (Managers / Leases / Applications). */
export function ManagerPortalStatusPills({
  tabs,
  activeId,
  onChange,
  /** `primary` = blue active pill (inbox-style); default = white active chip (leases/applications). */
  activeTone = "default",
  /** Single-row horizontal scroll with tighter chips (long lease labels on mobile). */
  compact = false,
  /** On phones, use one dropdown instead of a pill strip. */
  mobileSelect = true,
  selectAriaLabel = "Section view",
}: {
  tabs: { id: string; label: string; count: number; alert?: boolean; dataAttr?: string }[];
  activeId: string;
  onChange: (id: string) => void;
  activeTone?: "default" | "primary";
  compact?: boolean;
  mobileSelect?: boolean;
  selectAriaLabel?: string;
}) {
  const isPrimary = activeTone === "primary";
  const pills = (
    <div
      className={
        compact
          ? "inline-flex max-w-full flex-nowrap items-center gap-0.5 overflow-x-auto rounded-full border border-border bg-accent/30 p-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "inline-flex max-w-full flex-wrap items-center gap-1 rounded-2xl border border-border bg-accent/30 p-1 sm:rounded-full"
      }
    >
      {tabs.map((tab) => {
        const active = activeId === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            data-attr={tab.dataAttr}
            onClick={() => onChange(tab.id)}
            className={`flex shrink-0 items-center rounded-full font-semibold transition-all duration-150 ${
              compact ? "min-h-8 gap-1 px-2.5 py-1 text-xs" : "min-h-9 gap-1.5 px-4 py-1.5 text-sm"
            } ${
              active
                ? isPrimary
                  ? "bg-primary text-primary-foreground shadow-[var(--shadow-sm)]"
                  : "bg-card text-foreground shadow-[var(--shadow-sm)] [html[data-theme=dark]_&]:portal-status-pill-active"
                : "text-muted hover:text-foreground [html[data-theme=dark]_&]:text-white/78"
            }`}
          >
            {tab.alert ? (
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[var(--status-overdue-fg)]" />
            ) : null}
            {tab.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                active
                  ? isPrimary
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-accent text-foreground [html[data-theme=dark]_&]:portal-status-pill-count-active"
                  : "bg-accent/50 text-muted [html[data-theme=dark]_&]:bg-white/10 [html[data-theme=dark]_&]:text-white/75"
              }`}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );

  if (!mobileSelect) return pills;

  return (
    <>
      <label className="flex shrink-0 md:hidden">
        <span className="sr-only">{selectAriaLabel}</span>
        <Select
          className={PORTAL_MOBILE_STATUS_SELECT_CLASS}
          value={activeId}
          onChange={(e) => onChange(e.target.value)}
          data-attr="portal-status-mobile-select"
        >
          {tabs.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.label} ({tab.count})
            </option>
          ))}
        </Select>
      </label>
      <div className="hidden min-w-0 md:block">{pills}</div>
    </>
  );
}

/** Linked KPI tile on manager / resident dashboards. */
export function PortalDashboardTile({
  label,
  value,
  sub,
  href,
  urgent,
  dataAttr,
}: {
  label: string;
  value: string | number;
  sub?: string;
  href: string;
  urgent?: boolean;
  dataAttr?: string;
}) {
  return (
    <Link
      href={href}
      data-attr={dataAttr}
      className={`surface-panel group flex min-h-[88px] flex-col justify-center gap-1 rounded-2xl border p-5 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-card)] [html[data-native]_&]:min-h-[4.25rem] [html[data-native]_&]:gap-0.5 [html[data-native]_&]:rounded-xl [html[data-native]_&]:p-3.5 ${
        urgent ? "border-[var(--status-pending-bg)] ring-1 ring-[var(--status-pending-bg)]" : "border-border hover:border-primary/25"
      }`}
    >
      <p className="text-[2rem] font-bold leading-none tracking-[-0.03em] text-foreground [html[data-native]_&]:text-[1.5rem]">{value}</p>
      <p className="text-sm font-medium text-muted [html[data-native]_&]:text-xs">{label}</p>
      {sub ? <p className="text-xs text-muted [html[data-native]_&]:text-[11px]">{sub}</p> : null}
    </Link>
  );
}

/** Section title row with optional link (resident / vendor / admin dashboards). */
export function PortalDashboardSectionHeader({
  title,
  href,
  linkLabel,
  badge,
  dataAttr,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  /** Stable notification indicator rendered on the right, next to the section link (e.g. overdue count). */
  badge?: ReactNode;
  dataAttr?: string;
}) {
  const { isNative } = useIsNativeApp();
  const compactLink = isNative && linkLabel ? "→" : linkLabel;

  return (
    <div className="flex items-start justify-between gap-2 [html[data-native]_&]:gap-1.5 sm:items-center sm:gap-3">
      <h2 className="min-w-0 text-xs font-bold uppercase tracking-[0.12em] text-muted [html[data-native]_&]:leading-snug">
        {title}
      </h2>
      {badge || (href && compactLink) ? (
        <div className="flex shrink-0 items-center gap-2 [html[data-native]_&]:gap-1.5">
          {badge ?? null}
          {href && compactLink ? (
            <Link
              href={href}
              data-attr={dataAttr}
              aria-label={isNative && linkLabel ? linkLabel : undefined}
              className="whitespace-nowrap text-xs font-semibold text-primary hover:underline underline-offset-2 [html[data-native]_&]:px-0.5 [html[data-native]_&]:text-sm"
            >
              {compactLink}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Inner card shell for dashboard section panels. */
export const PORTAL_DASHBOARD_SECTION_CARD =
  "rounded-2xl border border-border bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)] [html[data-native]_&]:rounded-xl [html[data-native]_&]:p-3";

/** Vertical stack spacing for dashboard sections — tighter on native. */
export const PORTAL_DASHBOARD_STACK = "space-y-5 max-lg:space-y-3 [html[data-native]_&]:space-y-3";

/** KPI row: 2-column grid on phones (no sideways scroll); horizontal strip from `sm` up. */
export function PortalDashboardKpiRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 max-md:[&>*]:min-w-0 sm:-mx-1 sm:flex sm:gap-2 sm:overflow-x-auto sm:px-1 sm:pb-1 sm:[&>*]:min-w-[7.25rem] sm:[&>*]:max-w-[9.5rem] [-ms-overflow-style:none] sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

/** Small palette for dashboard stat tiles — uses portal status tokens (light + dark safe). */
export type PortalDashboardKpiTone = "brand" | "success" | "warning" | "danger" | "neutral";

const KPI_TONE_STYLES: Record<
  PortalDashboardKpiTone,
  { accent: string; shell: string; value: string; label: string }
> = {
  brand: {
    accent: "border-l-[var(--status-approved-fg)]",
    shell: "bg-[color-mix(in_srgb,var(--status-approved-bg)_42%,var(--card))]",
    value: "text-[var(--status-approved-fg)]",
    label: "text-[color-mix(in_srgb,var(--status-approved-fg)_70%,var(--muted))]",
  },
  success: {
    accent: "border-l-[var(--status-confirmed-fg)]",
    shell: "bg-[color-mix(in_srgb,var(--status-confirmed-bg)_45%,var(--card))]",
    value: "text-[var(--status-confirmed-fg)]",
    label: "text-[color-mix(in_srgb,var(--status-confirmed-fg)_68%,var(--muted))]",
  },
  warning: {
    accent: "border-l-[var(--status-pending-fg)]",
    shell: "bg-[color-mix(in_srgb,var(--status-pending-bg)_50%,var(--card))]",
    value: "text-[var(--status-pending-fg)]",
    label: "text-[color-mix(in_srgb,var(--status-pending-fg)_72%,var(--muted))]",
  },
  danger: {
    accent: "border-l-[var(--status-overdue-fg)]",
    shell: "bg-[color-mix(in_srgb,var(--status-overdue-bg)_48%,var(--card))]",
    value: "text-[var(--status-overdue-fg)]",
    label: "text-[color-mix(in_srgb,var(--status-overdue-fg)_70%,var(--muted))]",
  },
  neutral: {
    accent: "border-l-primary/55",
    shell: "bg-[color-mix(in_srgb,var(--primary)_6%,var(--card))]",
    value: "text-foreground",
    label: "text-muted",
  },
};

/** Restrained KPI tile: header label on top, centered value (no subtext). */
export function PortalDashboardKpiTile({
  label,
  value,
  href,
  tone = "neutral",
  emphasis = false,
  dataAttr,
}: {
  label: string;
  value: string | number;
  href: string;
  tone?: PortalDashboardKpiTone;
  /** Stronger value weight when the metric needs attention. */
  emphasis?: boolean;
  dataAttr?: string;
}) {
  const styles = KPI_TONE_STYLES[tone];
  return (
    <Link
      href={href}
      data-attr={dataAttr}
      className={cn(
        "flex min-h-[5.25rem] min-w-0 flex-1 flex-col items-center justify-between rounded-xl border border-border border-l-[3px] px-2.5 py-2.5 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow,transform] duration-150",
        "hover:-translate-y-px hover:border-primary/35 hover:shadow-[0_4px_14px_rgba(15,23,42,0.07)]",
        "sm:min-h-[5.5rem] sm:min-w-[7.5rem] sm:px-3 sm:py-3 [html[data-native]_&]:min-h-[4.75rem] [html[data-native]_&]:rounded-lg [html[data-native]_&]:px-2 [html[data-native]_&]:py-2",
        styles.accent,
        styles.shell,
      )}
    >
      <span
        className={cn(
          "w-full shrink-0 px-0.5 text-[9px] font-semibold uppercase leading-tight tracking-[0.06em] sm:text-[10px] sm:tracking-[0.08em]",
          "line-clamp-2 [html[data-native]_&]:text-[8px]",
          styles.label,
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "flex w-full flex-1 items-center justify-center whitespace-nowrap tabular-nums tracking-[-0.02em]",
          "text-[1.5rem] sm:text-[1.65rem] [html[data-native]_&]:text-[1.35rem]",
          emphasis ? "font-bold" : "font-semibold",
          styles.value,
        )}
      >
        {value}
      </span>
    </Link>
  );
}

/** Compact list row used in dashboard section previews. */
export function PortalDashboardCompactRow({
  title,
  subtitle,
  badge,
  stackBadge,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  /** Stack badge below title on narrow/native screens instead of squeezing beside it. */
  stackBadge?: boolean;
}) {
  const { isNative } = useIsNativeApp();
  const stacked = stackBadge ?? isNative;

  return (
    <li
      className={`rounded-xl bg-accent/30 px-3 py-2 [html[data-native]_&]:px-2.5 [html[data-native]_&]:py-1.5 ${
        stacked ? "flex flex-col items-stretch gap-1.5 [html[data-native]_&]:gap-1" : "flex items-start justify-between gap-2.5 [html[data-native]_&]:gap-2"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground [html[data-native]_&]:text-[13px] [html[data-native]_&]:leading-snug">{title}</p>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-muted [html[data-native]_&]:text-[11px] [html[data-native]_&]:leading-snug">{subtitle}</p>
        ) : null}
      </div>
      {badge ? <div className={stacked ? "self-start" : "shrink-0"}>{badge}</div> : null}
    </li>
  );
}

/** Dashboard section list with native/mobile preview limits and optional overflow link. */
export function PortalDashboardPreviewList<T>({
  items,
  href,
  emptyMessage,
  keyForItem,
  renderRow,
}: {
  items: T[];
  href: string;
  emptyMessage: string;
  keyForItem?: (item: T) => string | number;
  renderRow: (item: T) => ReactNode;
}) {
  const { visible, overflow } = usePortalPreviewSlice(items);
  const { isNative } = useIsNativeApp();

  if (items.length === 0) {
    return <p className="mt-3 text-sm text-muted [html[data-native]_&]:mt-2 [html[data-native]_&]:text-xs">{emptyMessage}</p>;
  }

  return (
    <>
      <ul className="mt-3 space-y-1.5 [html[data-native]_&]:mt-2 [html[data-native]_&]:space-y-1">
        {visible.map((item, index) => (
          <Fragment key={keyForItem?.(item) ?? index}>{renderRow(item)}</Fragment>
        ))}
      </ul>
      <PortalPreviewOverflowLink overflow={overflow} href={href} label={isNative ? `View all (${items.length}) →` : undefined} />
    </>
  );
}

export { formatCompactChargeLine, formatCompactPlacementLine };

/** Manager sections aligned with admin portal leases / managers shell. */
export function ManagerPortalPageShell({
  title,
  subtitle,
  titleAside,
  filterRow,
  children,
  hideTitleOnNative = false,
  hideTitleOnMobileNav = true,
  welcomeSubtitle = false,
  compactFilterRow = false,
  mobileHideFilterRow = false,
  mobileFlush = false,
}: {
  title: string;
  subtitle?: string;
  titleAside?: ReactNode;
  filterRow?: ReactNode;
  children: ReactNode;
  /** Visually hide the page title in the native app (bottom nav shows the section). */
  hideTitleOnNative?: boolean;
  /** Hide duplicate page title on mobile when {@link PortalMobileNavBar} shows the section name. */
  hideTitleOnMobileNav?: boolean;
  /** Larger welcome line under the title (portal dashboards). */
  welcomeSubtitle?: boolean;
  /** Tighter filter row spacing (Communication on mobile). */
  compactFilterRow?: boolean;
  /** Omit filter chrome on phones (e.g. Communication thread reading). */
  mobileHideFilterRow?: boolean;
  /** Tighter section chrome on phones (e.g. full-bleed inbox thread). */
  mobileFlush?: boolean;
}) {
  const titleAsideDesktopOnly = Boolean(titleAside && filterRow);
  return (
    <div
      className={cn(
        PORTAL_SECTION_SURFACE,
        "relative z-0 min-w-0 w-full shrink-0",
        mobileFlush &&
          "max-md:rounded-xl max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:shadow-none max-md:backdrop-blur-none",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {/* min-w-0 (not shrink-0) so a long title/subtitle shrinks + wraps within
            the viewport on mobile instead of forcing horizontal overflow. */}
        <div className="min-w-0">
          <h1
            className={`text-[1.35rem] font-bold tracking-[-0.02em] text-foreground sm:text-[1.75rem] [html[data-native]_&]:text-[1.2rem] ${
              hideTitleOnNative ? "[html[data-native]_&]:sr-only" : ""
            } ${hideTitleOnMobileNav ? "max-md:sr-only" : ""}`}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              className={
                welcomeSubtitle
                  ? "mt-1 text-base font-medium leading-snug text-foreground max-md:text-left max-md:text-lg [html[data-native]_&]:mt-1 [html[data-native]_&]:text-base"
                  : "mt-1 line-clamp-2 text-sm text-muted [html[data-native]_&]:mt-0.5 [html[data-native]_&]:text-xs"
              }
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        {titleAside ? (
          <div
            className={cn(
              "ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2",
              titleAsideDesktopOnly && "max-md:hidden",
            )}
          >
            {titleAside}
          </div>
        ) : null}
      </div>
      {filterRow ? (
        <>
          <div
            className={cn(
              compactFilterRow
                ? "mt-2 border-b border-border pb-2 max-md:mt-0 max-md:pb-1.5 sm:mt-4 sm:pb-4 [html[data-native]_&]:mt-1.5 [html[data-native]_&]:pb-2"
                : "mt-4 border-b border-border pb-4 sm:mt-6 sm:pb-6 [html[data-native]_&]:mt-2.5 [html[data-native]_&]:pb-2.5",
              mobileHideFilterRow && "max-md:hidden",
              mobileFlush && "max-md:mt-0 max-md:border-0 max-md:pb-0",
            )}
          >
            <div className={cn(PORTAL_MOBILE_TOOLBAR_ROW_CLASS, "md:contents")}>
              {filterRow}
              {titleAside && titleAsideDesktopOnly ? (
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 max-md:flex-nowrap md:hidden">
                  {titleAside}
                </div>
              ) : null}
            </div>
          </div>
          <div
            className={cn(
              compactFilterRow
                ? "mt-2 sm:mt-4 [html[data-native]_&]:mt-1.5"
                : "mt-4 sm:mt-6 [html[data-native]_&]:mt-2.5",
              mobileHideFilterRow && "max-md:mt-0",
              mobileFlush && "max-md:mt-0",
            )}
          >
            {children}
          </div>
        </>
      ) : (
        <div className="mt-4 sm:mt-6 max-lg:mt-2 [html[data-native]_&]:mt-0">{children}</div>
      )}
    </div>
  );
}

/** Table header cell class (admin leases / managers / portal tabs).
 *  `w-0` pairs with {@link PORTAL_TABLE_TD}'s `max-w-0` under `table-fixed` so data
 *  columns share the remaining width instead of shrinking to header label width. */
export const MANAGER_TABLE_TH =
  "portal-table-th w-0 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted sm:px-5";

/** Shared toolbar shell for filters/toggles in portal tabs. */
export const PORTAL_TOOLBAR_GROUP =
  "inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-border bg-accent/30 p-1";

/** Shared pill toggle button in portal toolbars. */
export const PORTAL_TOOLBAR_PILL_BUTTON =
  "min-h-9 rounded-full px-4 py-1.5 text-sm font-semibold text-muted transition hover:text-foreground [html[data-theme=dark]_&]:text-white/78";

/** Active variant for toolbar pill buttons. */
export const PORTAL_TOOLBAR_PILL_BUTTON_ACTIVE =
  "bg-card text-foreground shadow-[var(--shadow-sm)] [html[data-theme=dark]_&]:portal-status-pill-active";

/** Label used before toolbar selects (Property/Sort/etc.). */
export const PORTAL_TOOLBAR_LABEL = "text-xs font-semibold text-muted";

/** Shared dropdown style for toolbar selects. */
export const PORTAL_TOOLBAR_SELECT =
  "h-10 appearance-none rounded-full border border-border bg-card px-3.5 pr-9 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring";

/** Wraps a native `<select>` with a trailing chevron (toolbar / filter pills). */
export function PortalToolbarSelectWrap({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative inline-grid min-w-0 [&>*:first-child]:col-start-1 [&>*:first-child]:row-start-1 ${className ?? ""}`.trim()}
    >
      {children}
      <ChevronDown
        className="pointer-events-none col-start-1 row-start-1 mr-3 self-center justify-self-end h-4 w-4 text-muted"
        aria-hidden
      />
    </div>
  );
}

/** Shared action button sizing for page header controls. */
export const PORTAL_HEADER_ACTION_BTN =
  "h-10 rounded-full px-5 text-sm font-semibold [html[data-native]_&]:h-9 [html[data-native]_&]:px-3.5 [html[data-native]_&]:text-xs";

/** Compact toolbar buttons (resident profile sections on mobile). */
export const RESIDENT_DETAIL_HEADER_ACTION_BTN =
  "h-8 shrink-0 whitespace-nowrap rounded-full px-2.5 text-[11px] font-semibold sm:h-9 sm:px-3.5 sm:text-xs [html[data-native]_&]:h-8 [html[data-native]_&]:px-2.5 [html[data-native]_&]:text-[11px]";

export const RESIDENT_DETAIL_HEADER_ACTIONS_ROW =
  "flex max-w-full shrink-0 flex-nowrap items-center justify-end gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-2 sm:overflow-visible sm:pb-0";

/** Desktop-only page actions — pair with {@link PORTAL_FILTER_ACTIONS_MOBILE} in filter rows. */
export const PORTAL_PAGE_ACTIONS_DESKTOP = "hidden shrink-0 flex-wrap items-center justify-end gap-2 lg:flex";

/** Mobile page actions — place inside {@link ManagerPortalFilterRow}. */
export const PORTAL_FILTER_ACTIONS_MOBILE = "flex max-w-full flex-wrap items-center gap-2 lg:hidden";

/** Shared sort dropdown shell for portal section toolbars. */
export function PortalToolbarSortSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  ariaLabel,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  ariaLabel?: string;
}) {
  return (
    <div className="inline-flex min-w-0 items-center gap-2">
      <span className={PORTAL_TOOLBAR_LABEL}>{label}</span>
      <FieldSingleSelect
        hideLabel
        label={ariaLabel ?? label}
        variant="pill"
        value={value}
        options={options.map((opt) => ({ value: opt.value, label: opt.label }))}
        onChange={(next) => onChange(next as T)}
        dataAttr={`portal-sort-${label.toLowerCase().replace(/\s+/g, "-")}`}
      />
    </div>
  );
}

/** Standard filter row wrapper (status pills + optional sort). */
export function ManagerPortalFilterRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full min-w-0 max-w-full flex-wrap items-center gap-4 max-md:gap-2", className)}>
      {children}
    </div>
  );
}

/** Right-aligned property / resident / sort controls inside {@link ManagerPortalFilterRow}. */

/** Status bucket pills with optional right-aligned filters on the same row (Payments-style). */
export function ManagerPortalStatusFilterRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex w-full min-w-0 flex-wrap items-center gap-3 max-md:mb-2 max-md:gap-2", className)}>{children}</div>
  );
}

export function ManagerPortalFilterActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ml-auto flex min-w-0 flex-wrap items-center justify-end gap-3", className)}>
      {children}
    </div>
  );
}

/** Shared inactive / active chip styles for toolbar toggles (e.g. Events calendar KPI row). */
export const PORTAL_KPI_CHIP_INACTIVE =
  "rounded-xl border border-border/60 bg-accent/30 px-4 py-3 text-left transition-colors duration-150 hover:border-border hover:bg-card";

export const PORTAL_KPI_CHIP_ACTIVE =
  "rounded-xl border border-primary bg-card px-4 py-3 text-left shadow-[inset_0_-3px_0_0_#007aff] ring-1 ring-primary/20 transition-colors duration-150";

export const PORTAL_KPI_CHIP_STATIC =
  "rounded-xl border border-border/60 bg-accent/30 px-4 py-3 text-left";

export const PORTAL_KPI_VALUE = "text-2xl font-bold tabular-nums tracking-tight text-foreground";
export const PORTAL_KPI_LABEL = "mt-1 text-xs font-medium text-muted";
