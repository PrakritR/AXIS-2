"use client";

import { useEffect, useState } from "react";
import type { DocumentScope } from "@/lib/reports/types";
import {
  DAYS_RENTED_DEFAULT_FIELDS,
  PROPERTY_RENT_RECEIPT_DEFAULT_FIELDS,
  RENT_RECEIPT_DEFAULT_FIELDS,
  type FormalFieldKey,
} from "@/lib/reports/formal-documents/spec";

export type FormalDocumentFilterState = {
  scope: DocumentScope;
  propertyId: string;
  residentEmail: string;
  roomLabel: string;
  includeFields: FormalFieldKey[];
};

type ScopeOptions = {
  properties: { id: string; label: string }[];
  tenants: { email: string; name: string }[];
  rooms: string[];
};

const FIELD_LABELS: Record<FormalFieldKey, string> = {
  receiptNumber: "Receipt number",
  issueDate: "Issue date",
  landlordBlock: "Landlord info",
  tenantBlock: "Tenant info",
  propertyBlock: "Property info",
  paymentDate: "Payment date",
  amount: "Amount",
  paymentMethod: "Payment method",
  periodCovered: "Period covered",
  category: "Category",
  balanceAfter: "Balance after payment",
  daysRented: "Days rented totals",
  daysAvailable: "Days available",
  personalUseNote: "Schedule E note",
};

export function FormalDocumentScopeBar({
  kind,
  filters,
  onChange,
}: {
  kind: "rent_receipt" | "days_rented" | "property_rent_receipt";
  filters: FormalDocumentFilterState;
  onChange: (next: Partial<FormalDocumentFilterState>) => void;
}) {
  const [options, setOptions] = useState<ScopeOptions>({ properties: [], tenants: [], rooms: [] });
  const defaultFields =
    kind === "rent_receipt"
      ? RENT_RECEIPT_DEFAULT_FIELDS
      : kind === "property_rent_receipt"
        ? PROPERTY_RENT_RECEIPT_DEFAULT_FIELDS
        : DAYS_RENTED_DEFAULT_FIELDS;
  const availableFields = defaultFields;

  useEffect(() => {
    const qs = filters.propertyId ? `?propertyId=${encodeURIComponent(filters.propertyId)}` : "";
    void fetch(`/api/reports/formal-documents/scope-options${qs}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setOptions(data as ScopeOptions))
      .catch(() => setOptions({ properties: [], tenants: [], rooms: [] }));
  }, [filters.propertyId]);

  const activeFields = filters.includeFields.length ? filters.includeFields : defaultFields;

  const toggleField = (key: FormalFieldKey) => {
    const base = filters.includeFields.length ? filters.includeFields : defaultFields;
    const has = base.includes(key);
    onChange({
      includeFields: has ? base.filter((f) => f !== key) : [...base, key],
    });
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-accent/15 p-4">
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
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div>
        <p className="text-xs font-medium text-muted">Include in document</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {availableFields.map((key) => (
            <label key={key} className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs">
              <input
                type="checkbox"
                checked={activeFields.includes(key)}
                onChange={() => toggleField(key)}
              />
              {FIELD_LABELS[key]}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export function buildFormalDocumentQuery(
  kind: "rent_receipt" | "days_rented" | "property_rent_receipt",
  dateFilters: { from: string; to: string },
  scopeFilters: FormalDocumentFilterState,
): string {
  const params = new URLSearchParams();
  params.set("kind", kind);
  params.set("scope", scopeFilters.scope);
  params.set("from", dateFilters.from);
  params.set("to", dateFilters.to);
  params.set("backfill", "1");
  if (scopeFilters.propertyId) params.set("propertyId", scopeFilters.propertyId);
  if (scopeFilters.residentEmail) params.set("residentEmail", scopeFilters.residentEmail);
  if (scopeFilters.roomLabel) params.set("roomLabel", scopeFilters.roomLabel);
  if (scopeFilters.includeFields.length) params.set("include", scopeFilters.includeFields.join(","));
  return params.toString();
}
