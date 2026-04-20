"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { PORTAL_PAGE_TITLE, PORTAL_SECTION_SURFACE, PortalKpiTabStrip } from "@/components/portal/portal-metrics";

export type ShellAction = {
  label: string;
  variant?: "primary" | "outline";
  onClick?: () => void;
  disabled?: boolean;
};

const selectClass =
  "h-10 rounded-full border border-slate-200/90 bg-white px-3.5 text-sm text-slate-800 outline-none transition focus:ring-2 focus:ring-primary/25";

/** Property dropdown wrapped like admin filter chips (rounded shell). */
export function PortalPropertyFilterPill({
  applications,
  residents,
}: {
  applications?: boolean;
  residents?: boolean;
}) {
  return (
    <div className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
      <PortalPropertyFilter applications={applications} residents={residents} />
    </div>
  );
}

/** Shared property filter row for portal headers. */
export function PortalPropertyFilter({
  applications,
  residents,
}: {
  applications?: boolean;
  residents?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={selectClass} aria-label="Properties">
        <option>All your properties</option>
      </select>
      {residents ? (
        <select className={selectClass} aria-label="Residents">
          <option>All residents</option>
        </select>
      ) : null}
      {applications ? (
        <select className={selectClass} aria-label="Applications">
          <option>All applications</option>
        </select>
      ) : null}
    </div>
  );
}

/**
 * Minimal portal workspace shell (admin-style): title row, optional filters,
 * pill actions, optional KPI strip, then body.
 */
export function ManagerSectionShell({
  title,
  filters,
  actions,
  kpis,
  activeKpiIndex: activeKpiIndexProp = 0,
  bodyClassName = "mt-6",
  children,
}: {
  title: string;
  filters?: ReactNode;
  actions?: ShellAction[];
  kpis?: { value: string; label: string }[];
  activeKpiIndex?: number;
  /** Spacing between header and main content (default mt-6). */
  bodyClassName?: string;
  children: ReactNode;
}) {
  const { showToast } = useAppUi();
  const [activeKpi, setActiveKpi] = useState(activeKpiIndexProp);

  return (
    <div className={`${PORTAL_SECTION_SURFACE} flex min-h-0 w-full max-w-full flex-1 flex-col`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className={PORTAL_PAGE_TITLE}>{title}</h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {filters ? <div className="flex flex-wrap items-center gap-2">{filters}</div> : null}
          {actions?.length ? (
            <div className="flex flex-wrap items-center gap-2">
              {actions.map((a) => (
                <Button
                  key={a.label}
                  type="button"
                  variant={a.variant ?? "outline"}
                  disabled={a.disabled}
                  onClick={
                    a.onClick ??
                    (() => {
                      showToast(
                        /refresh/i.test(a.label) ? "Refreshed (demo)." : `${a.label} (demo)`,
                      );
                    })
                  }
                >
                  {a.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {kpis?.length ? (
        <PortalKpiTabStrip
          items={kpis}
          activeIndex={activeKpi}
          onSelect={setActiveKpi}
          textAlign="center"
        />
      ) : null}

      <div className={`min-h-0 flex-1 flex flex-col ${bodyClassName}`}>{children}</div>
    </div>
  );
}
