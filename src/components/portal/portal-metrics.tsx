import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { PortalPreviewOverflowLink, usePortalPreviewSlice } from "@/components/portal/portal-data-table";
import { formatCompactChargeLine, formatCompactPlacementLine } from "@/lib/portal-mobile-preview";
import { useIsNativeApp } from "@/hooks/use-is-native-app";

/** Dashboard / KPI link tiles (manager, resident, admin). */
export const PORTAL_DASHBOARD_TILE_LINK =
  "block rounded-xl border border-border bg-card px-5 py-4 shadow-[var(--shadow-sm)] transition-[border-color,box-shadow,transform] duration-200 hover:border-primary/30 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5 active:translate-y-0";

/** Outer card wrapping most portal sections (matches Properties / Managers shell). */
export const PORTAL_SECTION_SURFACE =
  "rounded-2xl border border-border bg-card p-4 text-foreground shadow-[var(--shadow-card)] backdrop-blur-[1px] sm:rounded-[28px] sm:p-6 [html[data-native]_&]:px-3.5 [html[data-native]_&]:py-3.5";

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

/** Admin portal pattern: pill strip with label + count (Managers / Leases / Applications). */
export function ManagerPortalStatusPills({
  tabs,
  activeId,
  onChange,
  /** `primary` = blue active pill (inbox-style); default = white active chip (leases/applications). */
  activeTone = "default",
  /** Single-row horizontal scroll with tighter chips (long lease labels on mobile). */
  compact = false,
}: {
  tabs: { id: string; label: string; count: number; alert?: boolean; dataAttr?: string }[];
  activeId: string;
  onChange: (id: string) => void;
  activeTone?: "default" | "primary";
  compact?: boolean;
}) {
  const isPrimary = activeTone === "primary";
  return (
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

/** Section title row with optional link (manager / resident dashboards). */
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
export const PORTAL_DASHBOARD_STACK = "space-y-5 [html[data-native]_&]:space-y-3";

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
}: {
  title: string;
  subtitle?: string;
  titleAside?: ReactNode;
  filterRow?: ReactNode;
  children: ReactNode;
  /** Visually hide the page title in the native app (bottom nav shows the section). */
  hideTitleOnNative?: boolean;
}) {
  return (
    <div className={`${PORTAL_SECTION_SURFACE} relative z-0 min-w-0 w-full shrink-0`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 shrink-0">
          <h1
            className={`text-[1.35rem] font-bold tracking-[-0.02em] text-foreground sm:text-[1.75rem] [html[data-native]_&]:text-[1.2rem] ${
              hideTitleOnNative ? "[html[data-native]_&]:sr-only" : ""
            }`}
          >
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted [html[data-native]_&]:mt-0.5 [html[data-native]_&]:text-xs">
              {subtitle}
            </p>
          ) : null}
        </div>
        {titleAside ? (
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">{titleAside}</div>
        ) : null}
      </div>
      {filterRow ? (
        <>
          <div className="mt-4 border-b border-border pb-4 sm:mt-6 sm:pb-6 [html[data-native]_&]:mt-2.5 [html[data-native]_&]:pb-2.5">
            {filterRow}
          </div>
          <div className="mt-4 sm:mt-6 [html[data-native]_&]:mt-2.5">{children}</div>
        </>
      ) : (
        <div className="mt-4 sm:mt-6 [html[data-native]_&]:mt-0">{children}</div>
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
    <label className="inline-flex items-center gap-2 rounded-full border border-border bg-accent/30 p-1 pr-1.5">
      <span className={`${PORTAL_TOOLBAR_LABEL} pl-2`}>{label}</span>
      <PortalToolbarSelectWrap>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          aria-label={ariaLabel ?? label}
          className={PORTAL_TOOLBAR_SELECT}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </PortalToolbarSelectWrap>
    </label>
  );
}

/** Standard filter row wrapper (status pills + optional sort). */
export function ManagerPortalFilterRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-4">{children}</div>
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
