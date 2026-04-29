import type { ReactNode } from "react";

/** Outer white “card” wrapping most portal sections (matches Properties / Managers shell). */
export const PORTAL_SECTION_SURFACE =
  "rounded-[28px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.2)] backdrop-blur-sm sm:p-6";

/** Calendar week grid outer frame (matches manager calendar chrome). */
export const PORTAL_CALENDAR_FRAME = "overflow-hidden rounded-2xl border border-slate-200 bg-slate-200";

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
    <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-slate-200/90 bg-slate-100/70 p-1" role="tablist" aria-label="View">
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
                  ? "bg-white text-slate-900 shadow-[0_8px_22px_-18px_rgba(15,23,42,0.28)]"
                  : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Primary page title in portal workspaces (aligned with Axis Pro Portal dashboard). */
export const PORTAL_PAGE_TITLE = "text-[2rem] font-semibold tracking-[-0.03em] text-slate-950";

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
      <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-2xl border border-slate-200/90 bg-slate-100/70 p-1 sm:rounded-full">
        {statusTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onStatusChange(tab.id)}
            className={`flex min-h-9 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 ${
              activeStatusId === tab.id ? "bg-white text-slate-900 shadow-[0_8px_22px_-18px_rgba(15,23,42,0.28)]" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                activeStatusId === tab.id ? "bg-slate-100 text-slate-700" : "bg-slate-200/60 text-slate-500"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <div className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-slate-200/90 bg-slate-100/70 p-1 sm:rounded-full">
        {TIER_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onTierChange(opt.id)}
            className={`min-h-9 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 ${
              tierFilter === opt.id ? "bg-white text-slate-900 shadow-[0_8px_22px_-18px_rgba(15,23,42,0.28)]" : "text-slate-500 hover:text-slate-800"
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
          className="min-w-[10rem] flex-1 rounded-2xl border border-slate-200/80 bg-slate-50/60 px-5 py-4 sm:min-w-[11rem] sm:flex-none"
        >
          <p className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">{k.value}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">{k.label}</p>
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
      ? "border-slate-300 bg-white shadow-[0_10px_24px_-18px_rgba(15,23,42,0.28)] ring-1 ring-slate-200/80"
      : "border-slate-200/60 bg-slate-50/90 hover:border-slate-200 hover:bg-white",
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
            <p className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">{k.value}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">{k.label}</p>
          </button>
        );
      })}
    </div>
  );
}

/** Inner well for tables / lists below KPI rows. */
export function PortalContentWell({ children }: { children: ReactNode }) {
  return <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/90 bg-white">{children}</div>;
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
    <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-2xl border border-slate-200/90 bg-slate-100/70 p-1 sm:rounded-full">
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
                  ? "bg-slate-950 text-white shadow-[0_10px_24px_-18px_rgba(15,23,42,0.5)]"
                  : "bg-white text-slate-900 shadow-[0_8px_22px_-18px_rgba(15,23,42,0.28)]"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                active
                  ? isPrimary
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-700"
                  : "bg-slate-200/60 text-slate-500"
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
  titleAside,
  filterRow,
  children,
}: {
  title: string;
  titleAside?: ReactNode;
  filterRow?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`${PORTAL_SECTION_SURFACE} min-w-0 w-full`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-950">{title}</h1>
        {titleAside ? <div className="flex flex-wrap items-center gap-2 sm:justify-end">{titleAside}</div> : null}
      </div>
      {filterRow ? <div className="mt-5">{filterRow}</div> : null}
      <div className="mt-5">{children}</div>
    </div>
  );
}

/** Table header cell class (admin leases / managers / portal tabs). */
export const MANAGER_TABLE_TH =
  "px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400";

/** Shared inactive / active chip styles for toolbar toggles (e.g. Events calendar KPI row). */
export const PORTAL_KPI_CHIP_INACTIVE =
  "rounded-xl border border-slate-200/60 bg-slate-50/90 px-4 py-3 text-left transition-colors duration-150 hover:border-slate-200 hover:bg-white";

export const PORTAL_KPI_CHIP_ACTIVE =
  "rounded-xl border border-primary bg-white px-4 py-3 text-left shadow-[inset_0_-3px_0_0_#007aff] ring-1 ring-primary/20 transition-colors duration-150";

export const PORTAL_KPI_CHIP_STATIC =
  "rounded-xl border border-slate-200/60 bg-slate-50/90 px-4 py-3 text-left";

export const PORTAL_KPI_VALUE = "text-2xl font-bold tabular-nums tracking-tight text-slate-900";
export const PORTAL_KPI_LABEL = "mt-1 text-xs font-medium text-slate-500";
