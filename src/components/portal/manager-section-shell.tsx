"use client";

import type { ReactNode } from "react";
import type { ManagerPropertyFilterOption } from "@/lib/manager-portfolio-access";
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
  "h-10 rounded-full border border-slate-200/90 bg-white/95 px-3.5 text-sm text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition focus:ring-4 focus:ring-primary/10";

/** Property dropdown wrapped like admin filter chips (rounded shell). */
export function PortalPropertyFilterPill({
  applications,
  residents,
  propertyOptions,
  propertyValue,
  onPropertyChange,
  residentOptions,
  residentValue,
  onResidentChange,
  applicationOptions,
  applicationValue,
  onApplicationChange,
}: {
  applications?: boolean;
  residents?: boolean;
  propertyOptions?: ManagerPropertyFilterOption[];
  propertyValue?: string;
  onPropertyChange?: (propertyId: string) => void;
  residentOptions?: ManagerPropertyFilterOption[];
  residentValue?: string;
  onResidentChange?: (residentId: string) => void;
  applicationOptions?: ManagerPropertyFilterOption[];
  applicationValue?: string;
  onApplicationChange?: (applicationId: string) => void;
}) {
  const hasPropertyPick = Boolean(propertyOptions && propertyOptions.length > 0 && onPropertyChange);
  const hasResidentPick = Boolean(residents && residentOptions && residentOptions.length > 0 && onResidentChange);
  const hasApplicationPick = Boolean(applications && applicationOptions && applicationOptions.length > 0 && onApplicationChange);
  if (!hasPropertyPick && !hasResidentPick && !hasApplicationPick) return null;
  return (
    <div className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded-full border border-slate-200/90 bg-slate-100/70 p-1">
      <PortalPropertyFilter
        applications={applications}
        residents={residents}
        propertyOptions={propertyOptions}
        propertyValue={propertyValue}
        onPropertyChange={onPropertyChange}
        residentOptions={residentOptions}
        residentValue={residentValue}
        onResidentChange={onResidentChange}
        applicationOptions={applicationOptions}
        applicationValue={applicationValue}
        onApplicationChange={onApplicationChange}
      />
    </div>
  );
}

/** Shared property filter row for portal headers. */
export function PortalPropertyFilter({
  applications,
  residents,
  propertyOptions,
  propertyValue = "",
  onPropertyChange,
  residentOptions,
  residentValue = "",
  onResidentChange,
  applicationOptions,
  applicationValue = "",
  onApplicationChange,
}: {
  applications?: boolean;
  residents?: boolean;
  propertyOptions?: ManagerPropertyFilterOption[];
  propertyValue?: string;
  onPropertyChange?: (propertyId: string) => void;
  residentOptions?: ManagerPropertyFilterOption[];
  residentValue?: string;
  onResidentChange?: (residentId: string) => void;
  applicationOptions?: ManagerPropertyFilterOption[];
  applicationValue?: string;
  onApplicationChange?: (applicationId: string) => void;
}) {
  const hasPropertyPick = Boolean(propertyOptions && propertyOptions.length > 0 && onPropertyChange);
  const hasResidentPick = Boolean(residents && residentOptions && residentOptions.length > 0 && onResidentChange);
  const hasApplicationPick = Boolean(applications && applicationOptions && applicationOptions.length > 0 && onApplicationChange);
  if (!hasPropertyPick && !hasResidentPick && !hasApplicationPick) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasPropertyPick ? (
        <select
          className={selectClass}
          aria-label="Properties"
          value={propertyValue}
          onChange={(e) => onPropertyChange?.(e.target.value)}
        >
          <option value="">All your properties</option>
          {propertyOptions?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      ) : null}
      {hasResidentPick ? (
        <select
          className={selectClass}
          aria-label="Residents"
          value={residentValue}
          onChange={(e) => onResidentChange?.(e.target.value)}
        >
          <option value="">All residents</option>
          {residentOptions?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      ) : null}
      {hasApplicationPick ? (
        <select
          className={selectClass}
          aria-label="Applications"
          value={applicationValue}
          onChange={(e) => onApplicationChange?.(e.target.value)}
        >
          <option value="">All applications</option>
          {applicationOptions?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
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
                        /refresh/i.test(a.label) ? "Refreshed." : `${a.label}.`,
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
