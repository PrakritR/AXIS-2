import type { ReactNode } from "react";

/** Dashboard / KPI link tiles (manager, resident, admin). */
export const PORTAL_DASHBOARD_TILE_LINK =
  "glass-card block rounded-2xl px-5 py-4 transition-[border-color,box-shadow,transform] duration-200 hover:border-primary/30 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5 active:translate-y-0";

/** Outer glass card wrapping most portal sections (matches Properties / Managers shell). */
export const PORTAL_SECTION_SURFACE =
  "glass-card rounded-2xl p-4 sm:p-6";

/** Calendar week grid outer frame (matches manager calendar chrome). */
export const PORTAL_CALENDAR_FRAME = "overflow-hidden rounded-2xl border border-border bg-border/50";

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
    <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-border bg-[var(--glass-fill)] p-1 backdrop-blur-xl" role="tablist" aria-label="View">
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
                  ? "bg-primary/15 text-foreground shadow-[inset_0_0_0_1px_rgba(47,107,255,0.22)] ring-1 ring-primary/25 [html[data-theme=light]_&]:bg-card [html[data-theme=light]_&]:shadow-[var(--shadow-sm)]"
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

/** Primary page title in portal workspaces (aligned with Axis Property Portal dashboard). */
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
      <div className={`${PORTAL_TOOLBAR_GROUP} sm:rounded-full`}>
        {statusTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onStatusChange(tab.id)}
            className={`flex min-h-9 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 ${
              activeStatusId === tab.id ? PORTAL_TOOLBAR_PILL_BUTTON_ACTIVE : `${PORTAL_TOOLBAR_PILL_BUTTON} hover:text-foreground`
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                activeStatusId === tab.id ? "bg-primary/10 text-foreground" : "bg-accent text-muted"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <div className={`${PORTAL_TOOLBAR_GROUP} sm:rounded-full`}>
        {TIER_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onTierChange(opt.id)}
            className={`min-h-9 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 ${
              tierFilter === opt.id ? PORTAL_TOOLBAR_PILL_BUTTON_ACTIVE : `${PORTAL_TOOLBAR_PILL_BUTTON} hover:text-foreground`
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
          className="min-w-[10rem] flex-1 rounded-2xl border border-border bg-accent/40 px-5 py-4 sm:min-w-[11rem] sm:flex-none"
        >
          <p className={PORTAL_KPI_VALUE}>{k.value}</p>
          <p className={PORTAL_KPI_LABEL}>{k.label}</p>
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
    active ? PORTAL_KPI_CHIP_ACTIVE : PORTAL_KPI_CHIP_INACTIVE,
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
            <p className={PORTAL_KPI_VALUE}>{k.value}</p>
            <p className={PORTAL_KPI_LABEL}>{k.label}</p>
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
}: {
  tabs: { id: string; label: string; count: number }[];
  activeId: string;
  onChange: (id: string) => void;
  activeTone?: "default" | "primary";
}) {
  const isPrimary = activeTone === "primary";
  return (
    <div className={`${PORTAL_TOOLBAR_GROUP} sm:rounded-full`}>
      {tabs.map((tab) => {
        const active = activeId === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex min-h-9 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 ${
              active
                ? isPrimary
                  ? "bg-primary text-primary-foreground shadow-[0_8px_20px_-8px_rgba(47,107,255,0.45)]"
                  : PORTAL_TOOLBAR_PILL_BUTTON_ACTIVE
                : `${PORTAL_TOOLBAR_PILL_BUTTON} hover:text-foreground`
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                active
                  ? isPrimary
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-primary/10 text-foreground"
                  : "bg-accent text-muted"
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

/** Manager sections aligned with admin portal leases / managers shell. */
export function ManagerPortalPageShell({
  title,
  subtitle,
  titleAside,
  filterRow,
  children,
}: {
  title: string;
  subtitle?: string;
  titleAside?: ReactNode;
  filterRow?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`${PORTAL_SECTION_SURFACE} relative z-0 min-w-0 w-full shrink-0 overflow-hidden`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="text-[1.35rem] font-bold tracking-[-0.02em] text-foreground sm:text-[1.75rem]">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {titleAside ? <div className="flex flex-wrap items-center gap-2.5 sm:justify-end sm:pt-0.5">{titleAside}</div> : null}
      </div>
      {filterRow ? <div className="mt-6 border-b border-border pb-6">{filterRow}</div> : null}
      <div className="mt-6">{children}</div>
    </div>
  );
}

/** Table header cell class (admin leases / managers / portal tabs). */
export const MANAGER_TABLE_TH =
  "px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted sm:px-5";

/** Shared toolbar shell for filters/toggles in portal tabs. */
export const PORTAL_TOOLBAR_GROUP =
  "inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-border bg-[var(--glass-fill)] p-1 backdrop-blur-xl";

/** Shared pill toggle button in portal toolbars. */
export const PORTAL_TOOLBAR_PILL_BUTTON =
  "min-h-9 rounded-full px-4 py-1.5 text-sm font-semibold text-muted transition hover:text-foreground";

/** Active variant for toolbar pill buttons. */
export const PORTAL_TOOLBAR_PILL_BUTTON_ACTIVE =
  "bg-card text-foreground shadow-[var(--shadow-sm)] ring-1 ring-primary/15 [html[data-theme=light]_&]:bg-card";

/** Label used before toolbar selects (Property/Sort/etc.). */
export const PORTAL_TOOLBAR_LABEL = "text-xs font-semibold text-muted";

/** Shared dropdown style for toolbar selects. */
export const PORTAL_TOOLBAR_SELECT =
  "h-10 rounded-full border border-border bg-card px-3.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring";

/** Shared action button sizing for page header controls. */
export const PORTAL_HEADER_ACTION_BTN = "h-10 rounded-full px-5 text-sm font-semibold";

/** Shared inactive / active chip styles for toolbar toggles (e.g. Events calendar KPI row). */
export const PORTAL_KPI_CHIP_INACTIVE =
  "rounded-xl border border-border bg-accent/40 px-4 py-3 text-left transition-colors duration-150 hover:border-primary/20 hover:bg-card";

export const PORTAL_KPI_CHIP_ACTIVE =
  "rounded-xl border border-primary bg-card px-4 py-3 text-left shadow-[inset_0_-3px_0_0_var(--primary)] ring-1 ring-primary/20 transition-colors duration-150";

export const PORTAL_KPI_CHIP_STATIC =
  "rounded-xl border border-border bg-accent/40 px-4 py-3 text-left";

export const PORTAL_KPI_VALUE = "text-2xl font-bold tabular-nums tracking-tight text-foreground";
export const PORTAL_KPI_LABEL = "mt-1 text-xs font-medium text-muted";
