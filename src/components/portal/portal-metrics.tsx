import type { ReactNode } from "react";

/** Outer white “card” wrapping most portal sections (matches Properties / Managers shell). */
export const PORTAL_SECTION_SURFACE =
  "rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_14px_50px_-36px_rgba(15,23,42,0.16)] sm:p-6";

/** Primary page title in portal workspaces. */
export const PORTAL_PAGE_TITLE = "text-2xl font-bold tracking-tight text-[#0d1f4e]";

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
          className="min-w-[10rem] flex-1 rounded-xl border border-slate-200/80 bg-white px-5 py-4 sm:flex-none sm:min-w-[11rem]"
        >
          <p className="text-2xl font-bold tabular-nums tracking-tight text-[#0d1f4e]">{k.value}</p>
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
      ? "border-primary bg-white shadow-[inset_0_-3px_0_0_#007aff] ring-1 ring-primary/20"
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
            <p className="text-2xl font-bold tabular-nums tracking-tight text-[#0d1f4e]">{k.value}</p>
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

/** Shared inactive / active chip styles for toolbar toggles (e.g. Events calendar KPI row). */
export const PORTAL_KPI_CHIP_INACTIVE =
  "rounded-xl border border-slate-200/60 bg-slate-50/90 px-4 py-3 text-left transition-colors duration-150 hover:border-slate-200 hover:bg-white";

export const PORTAL_KPI_CHIP_ACTIVE =
  "rounded-xl border border-primary bg-white px-4 py-3 text-left shadow-[inset_0_-3px_0_0_#007aff] ring-1 ring-primary/20 transition-colors duration-150";

export const PORTAL_KPI_CHIP_STATIC =
  "rounded-xl border border-slate-200/60 bg-slate-50/90 px-4 py-3 text-left";

export const PORTAL_KPI_VALUE = "text-2xl font-bold tabular-nums tracking-tight text-[#0d1f4e]";
export const PORTAL_KPI_LABEL = "mt-1 text-xs font-medium text-slate-500";
