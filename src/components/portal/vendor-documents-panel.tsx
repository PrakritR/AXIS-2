"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { TabNav } from "@/components/ui/tabs";
import {
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  PORTAL_HEADER_ACTION_BTN,
} from "@/components/portal/portal-metrics";
import { ReportFilterBar, type ReportFilterState } from "@/components/portal/reports/report-filter-bar";
import { ReportGeneratePrompt } from "@/components/portal/reports/report-generate-prompt";
import { ReportTable } from "@/components/portal/reports/report-table";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import {
  MANAGER_WORK_ORDERS_EVENT,
  readVendorWorkOrderRows,
  syncManagerWorkOrdersFromServer,
} from "@/lib/manager-work-orders-storage";
import { safeFormatDateTime } from "@/lib/pacific-time";
import type { ReportResult } from "@/lib/reports/types";

const INCOME_DOCUMENT_TAB = { id: "income-documents", label: "Income documents" } as const;

type VendorDocumentScope = "portfolio" | "property";

type VendorDocumentScopeState = {
  scope: VendorDocumentScope;
  propertyName: string;
};

function defaultFilters(): ReportFilterState {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  return {
    propertyId: "",
    from: yearStart.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
    daysAhead: "90",
    taxYear: String(now.getFullYear() - 1),
  };
}

function defaultScopeFilters(): VendorDocumentScopeState {
  return { scope: "portfolio", propertyName: "" };
}

function propertyLabel(row: DemoManagerWorkOrderRow): string {
  const unit = row.unit?.trim();
  return unit && unit !== "—" ? `${row.propertyName} · ${unit}` : row.propertyName;
}

function workOrderAmountCents(row: DemoManagerWorkOrderRow): number {
  const labor = row.vendorCostCents ?? 0;
  const materials = row.materialsCostCents ?? 0;
  if (labor + materials > 0) return labor + materials;
  const parsed = parseFloat((row.cost ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function inDateRange(iso: string | undefined, from: string, to: string): boolean {
  if (!iso) return false;
  const day = iso.slice(0, 10);
  return day >= from && day <= to;
}

function buildVendorIncomeReport(
  rows: DemoManagerWorkOrderRow[],
  filters: ReportFilterState,
  scopeFilters: VendorDocumentScopeState,
): ReportResult {
  const paidRows = rows.filter((row) => {
    if (row.automationStatus !== "paid") return false;
    const paidDay = row.paidAt ?? row.completedAt;
    if (!inDateRange(paidDay, filters.from, filters.to)) return false;
    if (scopeFilters.scope === "property" && scopeFilters.propertyName) {
      return row.propertyName === scopeFilters.propertyName;
    }
    return true;
  });

  let totalCents = 0;
  const reportRows = paidRows.map((row) => {
    const labor = row.vendorCostCents ?? 0;
    const materials = row.materialsCostCents ?? 0;
    const total = workOrderAmountCents(row);
    totalCents += total;
    return {
      date: safeFormatDateTime(row.paidAt ?? row.completedAt ?? ""),
      property: propertyLabel(row),
      workOrder: row.title,
      labor: labor > 0 ? formatMoney(labor) : "—",
      materials: materials > 0 ? formatMoney(materials) : "—",
      total: total > 0 ? formatMoney(total) : row.cost || "—",
    };
  });

  return {
    id: "vendor-income-documents",
    title: "Income documents",
    columns: [
      { key: "date", label: "Date", format: "date" },
      { key: "property", label: "Property" },
      { key: "workOrder", label: "Work order" },
      { key: "labor", label: "Labor", align: "right", format: "money" },
      { key: "materials", label: "Materials", align: "right", format: "money" },
      { key: "total", label: "Total", align: "right", format: "money" },
    ],
    rows: reportRows,
    totals: reportRows.length
      ? {
          date: "",
          property: "",
          workOrder: "Total",
          labor: "",
          materials: "",
          total: formatMoney(totalCents),
        }
      : undefined,
  };
}

function VendorDocumentScopeBar({
  filters,
  onChange,
  propertyOptions,
}: {
  filters: VendorDocumentScopeState;
  onChange: (next: Partial<VendorDocumentScopeState>) => void;
  propertyOptions: { id: string; label: string }[];
}) {
  return (
    <>
      <label className="flex min-w-[9rem] flex-col gap-1.5 text-xs font-medium text-muted">
        Scope
        <select
          className="h-10 rounded-full border border-border bg-card px-3.5 text-sm text-foreground shadow-[var(--shadow-sm)]"
          value={filters.scope}
          onChange={(e) =>
            onChange({
              scope: e.target.value as VendorDocumentScope,
              propertyName: "",
            })
          }
        >
          <option value="portfolio">All properties</option>
          <option value="property">Per property</option>
        </select>
      </label>
      {filters.scope === "property" ? (
        <label className="flex min-w-[10rem] flex-col gap-1.5 text-xs font-medium text-muted">
          Property
          <select
            className="h-10 rounded-full border border-border bg-card px-3.5 text-sm text-foreground shadow-[var(--shadow-sm)]"
            value={filters.propertyName}
            onChange={(e) => onChange({ propertyName: e.target.value })}
          >
            <option value="">Select property</option>
            {propertyOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );
}

/** Vendor Documents — income from approved work orders (manager Documents layout, income tab only). */
export function VendorDocumentsPanel() {
  const { showToast } = useAppUi();
  const demo = isDemoModeActive();

  const [filters, setFilters] = useState(defaultFilters);
  const [scopeFilters, setScopeFilters] = useState(defaultScopeFilters);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [tick, setTick] = useState(0);
  const [unlinked, setUnlinked] = useState(false);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    void syncManagerWorkOrdersFromServer().then(bump);
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
    return () => window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
  }, []);

  useEffect(() => {
    if (demo) return;
    void fetch("/api/vendor/profile", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { linked?: boolean }) => setUnlinked(data.linked === false))
      .catch(() => undefined);
  }, [demo]);

  const propertyOptions = useMemo(() => {
    void tick;
    const seen = new Map<string, string>();
    for (const row of readVendorWorkOrderRows()) {
      const name = row.propertyName?.trim();
      if (!name || seen.has(name)) continue;
      seen.set(name, name);
    }
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [tick]);

  const runReport = useCallback(async () => {
    setLoading(true);
    try {
      void tick;
      const rows = readVendorWorkOrderRows();
      const next = buildVendorIncomeReport(rows, filters, scopeFilters);
      setReport(next);
      setGenerated(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load income documents.");
      setReport(null);
      setGenerated(false);
    } finally {
      setLoading(false);
    }
  }, [filters, scopeFilters, showToast, tick]);

  useEffect(() => {
    if (!isDemoModeActive()) return;
    queueMicrotask(() => void runReport());
  }, [runReport]);

  const documentTabItems = useMemo(
    () => [{ ...INCOME_DOCUMENT_TAB, href: "/vendor/documents" }],
    [],
  );

  return (
    <ManagerPortalPageShell
      title="Documents"
      titleAside={
        <Button
          type="button"
          variant="primary"
          className={PORTAL_HEADER_ACTION_BTN}
          onClick={() => void runReport()}
          disabled={loading}
          data-attr="vendor-documents-generate-report"
        >
          {loading ? "Generating…" : "Generate report"}
        </Button>
      }
      filterRow={
        <ManagerPortalFilterRow>
          <TabNav activeId={INCOME_DOCUMENT_TAB.id} items={documentTabItems} />
        </ManagerPortalFilterRow>
      }
    >
      <div className="space-y-4">
        {unlinked ? (
          <p
            className="rounded-xl border px-4 py-3 text-sm portal-banner-pending"
            data-attr="vendor-documents-unlinked-banner"
          >
            Waiting on a property manager to connect with you — income documents will appear once you&apos;re linked.
          </p>
        ) : null}

        <ReportFilterBar
          showProperty={false}
          showDateRange
          showDaysAhead={false}
          showTaxYear={false}
          showRunButton={false}
          filters={filters}
          onChange={(next) => setFilters((f) => ({ ...f, ...next }))}
          onRun={() => void runReport()}
          loading={loading}
          leading={
            <VendorDocumentScopeBar
              filters={scopeFilters}
              onChange={(next) => setScopeFilters((f) => ({ ...f, ...next }))}
              propertyOptions={propertyOptions}
            />
          }
        />

        {loading ? (
          <ReportGeneratePrompt loading loadingTitle="Generating documents…" />
        ) : !generated ? (
          <ReportGeneratePrompt title="No income documents yet." />
        ) : (
          <ReportTable report={report} loading={loading} generated={generated} />
        )}
      </div>
    </ManagerPortalPageShell>
  );
}
