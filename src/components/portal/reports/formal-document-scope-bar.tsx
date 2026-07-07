"use client";

import { useEffect, useState } from "react";
import type { DocumentScope } from "@/lib/reports/types";

export type FormalDocumentFilterState = {
  scope: DocumentScope;
  propertyId: string;
  residentEmail: string;
  roomLabel: string;
};

type ScopeOptions = {
  properties: { id: string; label: string }[];
  tenants: { email: string; name: string }[];
  rooms: { id: string; label: string }[];
};

export function FormalDocumentScopeBar({
  filters,
  onChange,
  inline = false,
  stacked = false,
}: {
  filters: FormalDocumentFilterState;
  onChange: (next: Partial<FormalDocumentFilterState>) => void;
  /** Render bare controls (no card) that sit inline in a shared portal filter row. */
  inline?: boolean;
  /** Vertical stack for modal forms. */
  stacked?: boolean;
}) {
  const [options, setOptions] = useState<ScopeOptions>({ properties: [], tenants: [], rooms: [] });

  useEffect(() => {
    const qs = filters.propertyId ? `?propertyId=${encodeURIComponent(filters.propertyId)}` : "";
    void fetch(`/api/reports/formal-documents/scope-options${qs}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setOptions(data as ScopeOptions))
      .catch(() => setOptions({ properties: [], tenants: [], rooms: [] }));
  }, [filters.propertyId]);

  // Match the shared portal filter-row control styling used by ReportFilterBar.
  const labelClass = inline
    ? stacked
      ? "flex w-full flex-col gap-1.5 text-xs font-medium text-muted"
      : "flex flex-col gap-1.5 text-xs font-medium text-muted"
    : "flex flex-col gap-1 text-xs font-medium text-muted";
  const selectClass = inline
    ? "h-10 w-full rounded-full border border-border bg-card px-3.5 text-sm text-foreground shadow-[var(--shadow-sm)]"
    : "h-9 w-full rounded-xl border border-border bg-card px-3 text-sm";

  const fieldClass = (minWidth: string) =>
    stacked ? labelClass : `${minWidth} ${labelClass}`;

  const controls = (
    <>
      <label className={fieldClass("min-w-[9rem]")}>
        Scope
        <select
          className={selectClass}
          value={filters.scope}
          onChange={(e) =>
            onChange({
              scope: e.target.value as DocumentScope,
              propertyId: "",
              residentEmail: "",
              roomLabel: "",
            })
          }
        >
          <option value="portfolio">All properties</option>
          <option value="property">Per property</option>
          <option value="tenant">Per tenant</option>
          <option value="room">Per room</option>
        </select>
      </label>

      {filters.scope === "property" || filters.scope === "tenant" || filters.scope === "room" ? (
        <label className={fieldClass("min-w-[10rem]")}>
          Property
          <select
            className={selectClass}
            value={filters.propertyId}
            onChange={(e) => onChange({ propertyId: e.target.value, residentEmail: "", roomLabel: "" })}
          >
            <option value="">Select property</option>
            {options.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {filters.scope === "tenant" ? (
        <label className={fieldClass("min-w-[10rem]")}>
          Tenant
          <select
            className={selectClass}
            value={filters.residentEmail}
            onChange={(e) => onChange({ residentEmail: e.target.value })}
          >
            <option value="">Select tenant</option>
            {options.tenants.map((t) => (
              <option key={t.email} value={t.email}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {filters.scope === "room" ? (
        <label className={fieldClass("min-w-[9rem]")}>
          Room / unit
          <select
            className={selectClass}
            value={filters.roomLabel}
            onChange={(e) => onChange({ roomLabel: e.target.value })}
          >
            <option value="">Select room</option>
            {options.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );

  if (inline) {
    return stacked ? <div className="flex flex-col gap-4">{controls}</div> : controls;
  }

  return (
    <div className="rounded-2xl border border-border bg-accent/15 p-4">
      <div className="flex flex-wrap gap-3">{controls}</div>
    </div>
  );
}

export function appendDocumentScopeParams(params: URLSearchParams, scopeFilters: FormalDocumentFilterState): void {
  params.set("scope", scopeFilters.scope);
  if (scopeFilters.propertyId) params.set("propertyId", scopeFilters.propertyId);
  if (scopeFilters.residentEmail) params.set("residentEmail", scopeFilters.residentEmail);
  if (scopeFilters.roomLabel) params.set("roomLabel", scopeFilters.roomLabel);
}

export function buildScopedReportQuery(
  dateFilters: { from: string; to: string },
  scopeFilters: FormalDocumentFilterState,
  extra?: Record<string, string>,
): string {
  const params = new URLSearchParams(extra);
  params.set("from", dateFilters.from);
  params.set("to", dateFilters.to);
  appendDocumentScopeParams(params, scopeFilters);
  return params.toString();
}

export function buildFormalDocumentQuery(
  kind: "rent_receipt" | "days_rented" | "property_rent_receipt",
  dateFilters: { from: string; to: string },
  scopeFilters: FormalDocumentFilterState,
): string {
  const params = new URLSearchParams();
  params.set("kind", kind);
  appendDocumentScopeParams(params, scopeFilters);
  params.set("from", dateFilters.from);
  params.set("to", dateFilters.to);
  return params.toString();
}
