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
}: {
  filters: FormalDocumentFilterState;
  onChange: (next: Partial<FormalDocumentFilterState>) => void;
}) {
  const [options, setOptions] = useState<ScopeOptions>({ properties: [], tenants: [], rooms: [] });

  useEffect(() => {
    const qs = filters.propertyId ? `?propertyId=${encodeURIComponent(filters.propertyId)}` : "";
    void fetch(`/api/reports/formal-documents/scope-options${qs}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setOptions(data as ScopeOptions))
      .catch(() => setOptions({ properties: [], tenants: [], rooms: [] }));
  }, [filters.propertyId]);

  return (
    <div className="rounded-2xl border border-border bg-accent/15 p-4">
      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-[8rem] flex-col gap-1 text-xs font-medium text-muted">
          Scope
          <select
            className="h-9 rounded-xl border border-border bg-card px-3 text-sm"
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
          <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-muted">
            Property
            <select
              className="h-9 rounded-xl border border-border bg-card px-3 text-sm"
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
          <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-muted">
            Tenant
            <select
              className="h-9 rounded-xl border border-border bg-card px-3 text-sm"
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
          <label className="flex min-w-[8rem] flex-col gap-1 text-xs font-medium text-muted">
            Room / unit
            <select
              className="h-9 rounded-xl border border-border bg-card px-3 text-sm"
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
      </div>
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
  params.set("backfill", "1");
  appendDocumentScopeParams(params, scopeFilters);
  params.set("from", dateFilters.from);
  params.set("to", dateFilters.to);
  return params.toString();
}
