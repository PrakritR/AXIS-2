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
};

const selectClass =
  "h-10 rounded-full border border-slate-200/90 bg-white px-3.5 text-sm text-slate-800 outline-none transition focus:ring-2 focus:ring-primary/25";

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
  children,
}: {
  title: string;
  filters?: ReactNode;
  actions?: ShellAction[];
  kpis?: { value: string; label: string }[];
  activeKpiIndex?: number;
  children: ReactNode;
}) {
  const { showToast } = useAppUi();
  const [activeKpi, setActiveKpi] = useState(activeKpiIndexProp);

  return (
    <div className={PORTAL_SECTION_SURFACE}>
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

      <div className="mt-6">{children}</div>
    </div>
  );
}
