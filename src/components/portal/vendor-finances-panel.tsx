"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TabNav } from "@/components/ui/tabs";
import {
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  MANAGER_TABLE_TH,
} from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR,
  PortalDataTableEmpty,
} from "@/components/portal/portal-data-table";
import { ReportFilterBar, type ReportFilterState } from "@/components/portal/reports/report-filter-bar";
import { MANAGER_WORK_ORDERS_EVENT, readVendorWorkOrderRows, syncManagerWorkOrdersFromServer } from "@/lib/manager-work-orders-storage";
import {
  buildVendorIncomeRows,
  buildVendorPropertyFilterOptions,
  filterVendorIncomeRows,
  formatVendorIncomeMoney,
  vendorIncomeTotals,
  type VendorIncomeRow,
} from "@/lib/vendor-income";
import { fetchVendorPayoutsResult, type VendorPayout } from "@/lib/vendor-payouts";

const VENDOR_FINANCE_TABS = [{ id: "income", label: "Income" }] as const;

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

function formatIncomeDate(dateIso: string): string {
  if (!dateIso) return "—";
  const day = dateIso.slice(0, 10);
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function payoutStatusTone(status: VendorIncomeRow["payoutStatus"]): string {
  if (status === "paid") {
    return "portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  }
  if (status === "failed") {
    return "portal-badge-danger ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  }
  if (status === "pending") {
    return "portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  }
  return "bg-accent/30 text-foreground ring-1 ring-border";
}

function compareIncomeRows(a: VendorIncomeRow, b: VendorIncomeRow, key: string, dir: "asc" | "desc"): number {
  let cmp = 0;
  if (key === "date") {
    cmp = (a.dateIso || "").localeCompare(b.dateIso || "");
  } else if (key === "workOrder") {
    cmp = a.workOrderTitle.localeCompare(b.workOrderTitle, undefined, { sensitivity: "base" });
  } else if (key === "property") {
    cmp = a.propertyLabel.localeCompare(b.propertyLabel, undefined, { sensitivity: "base" });
  } else if (key === "labor") {
    cmp = a.laborCents - b.laborCents;
  } else if (key === "materials") {
    cmp = a.materialsCents - b.materialsCents;
  } else if (key === "total") {
    cmp = a.totalCents - b.totalCents;
  } else if (key === "payoutStatus") {
    cmp = a.payoutStatusLabel.localeCompare(b.payoutStatusLabel, undefined, { sensitivity: "base" });
  }
  return dir === "asc" ? cmp : -cmp;
}

function VendorIncomeTable({
  rows,
  sortKey,
  sortDir,
  onHeaderSort,
}: {
  rows: VendorIncomeRow[];
  sortKey: string;
  sortDir: "asc" | "desc";
  onHeaderSort: (key: string) => void;
}) {
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => compareIncomeRows(a, b, sortKey, sortDir)),
    [rows, sortKey, sortDir],
  );
  const totals = useMemo(() => vendorIncomeTotals(rows), [rows]);

  if (rows.length === 0) {
    return <PortalDataTableEmpty message="No income entries yet." icon="finance" />;
  }

  const columns = [
    { key: "date", label: "Date", align: "left" as const },
    { key: "workOrder", label: "Work order", align: "left" as const },
    { key: "property", label: "Property", align: "left" as const },
    { key: "labor", label: "Labor", align: "right" as const },
    { key: "materials", label: "Materials", align: "right" as const },
    { key: "total", label: "Total", align: "right" as const },
    { key: "payoutStatus", label: "Payout status", align: "left" as const },
  ];

  return (
    <>
      <div className="space-y-2 lg:hidden">
        {sortedRows.map((row) => (
          <div key={row.id} className={PORTAL_MOBILE_CARD_CLASS}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <div className="min-w-0 col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted/70">Work order</p>
                <p className="truncate text-sm font-medium text-foreground">{row.workOrderTitle}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted/70">Date</p>
                <p className="truncate text-sm text-foreground">{formatIncomeDate(row.dateIso)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted/70">Total</p>
                <p className="truncate text-sm font-medium tabular-nums text-foreground">
                  {formatVendorIncomeMoney(row.totalCents)}
                </p>
              </div>
              <div className="min-w-0 col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted/70">Property</p>
                <p className="truncate text-sm text-foreground">{row.propertyLabel}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted/70">Labor</p>
                <p className="truncate text-sm tabular-nums text-foreground">{formatVendorIncomeMoney(row.laborCents)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted/70">Materials</p>
                <p className="truncate text-sm tabular-nums text-foreground">
                  {formatVendorIncomeMoney(row.materialsCents)}
                </p>
              </div>
              <div className="min-w-0 col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted/70">Payout status</p>
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${payoutStatusTone(row.payoutStatus)}`}
                >
                  {row.payoutStatusLabel}
                </span>
              </div>
            </div>
          </div>
        ))}
        <div className={`${PORTAL_MOBILE_CARD_CLASS} bg-accent/10`}>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <div className="min-w-0 col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted/70">Total income</p>
              <p className="truncate text-sm font-semibold tabular-nums text-foreground">
                {formatVendorIncomeMoney(totals.totalCents)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className={PORTAL_DATA_TABLE}>
            <thead>
              <tr className={PORTAL_TABLE_HEAD_ROW}>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`${MANAGER_TABLE_TH} ${col.align === "right" ? "text-right" : "text-left"} cursor-pointer select-none hover:bg-accent/30 transition`}
                    onClick={() => onHeaderSort(col.key)}
                    data-attr={`vendor-finances-sort-${col.key}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      <span className="text-[10px] text-muted/60">
                        {sortKey === col.key ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.id} className={PORTAL_TABLE_TR}>
                  <td className={`${PORTAL_TABLE_TD} text-muted`}>{formatIncomeDate(row.dateIso)}</td>
                  <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{row.workOrderTitle}</td>
                  <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{row.propertyLabel}</td>
                  <td className={`${PORTAL_TABLE_TD} text-right tabular-nums`}>{formatVendorIncomeMoney(row.laborCents)}</td>
                  <td className={`${PORTAL_TABLE_TD} text-right tabular-nums`}>
                    {formatVendorIncomeMoney(row.materialsCents)}
                  </td>
                  <td className={`${PORTAL_TABLE_TD} text-right tabular-nums font-medium text-foreground`}>
                    {formatVendorIncomeMoney(row.totalCents)}
                  </td>
                  <td className={PORTAL_TABLE_TD}>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${payoutStatusTone(row.payoutStatus)}`}
                    >
                      {row.payoutStatusLabel}
                    </span>
                    {row.payoutFailureReason ? (
                      <p className="mt-1 text-xs text-muted">{row.payoutFailureReason}</p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-accent/10 font-semibold text-sm">
                <td className={PORTAL_TABLE_TD}>Total income</td>
                <td className={PORTAL_TABLE_TD} />
                <td className={PORTAL_TABLE_TD} />
                <td className={`${PORTAL_TABLE_TD} text-right tabular-nums`}>
                  {formatVendorIncomeMoney(totals.laborCents)}
                </td>
                <td className={`${PORTAL_TABLE_TD} text-right tabular-nums`}>
                  {formatVendorIncomeMoney(totals.materialsCents)}
                </td>
                <td className={`${PORTAL_TABLE_TD} text-right tabular-nums`}>
                  {formatVendorIncomeMoney(totals.totalCents)}
                </td>
                <td className={PORTAL_TABLE_TD} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}

/** Vendor Finances — income earned from completed work orders and payouts. */
export function VendorFinancesPanel({
  tabId,
  basePath = "/vendor",
}: {
  tabId: string;
  basePath?: string;
}) {
  const [filters, setFilters] = useState(defaultFilters);
  const [tick, setTick] = useState(0);
  const [payoutsByWorkOrderId, setPayoutsByWorkOrderId] = useState<Record<string, VendorPayout>>({});
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const loadPayouts = useCallback(async () => {
    const result = await fetchVendorPayoutsResult();
    if (!result.ok) return;
    setPayoutsByWorkOrderId(Object.fromEntries(result.payouts.map((p) => [p.workOrderId, p])));
  }, []);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    void syncManagerWorkOrdersFromServer().then(bump);
    void loadPayouts();
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
    return () => window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
  }, [loadPayouts]);

  const allRows = useMemo(() => {
    void tick;
    return buildVendorIncomeRows(readVendorWorkOrderRows(), payoutsByWorkOrderId);
  }, [tick, payoutsByWorkOrderId]);

  const propertyOptions = useMemo(() => buildVendorPropertyFilterOptions(allRows), [allRows]);

  const filteredRows = useMemo(
    () =>
      filterVendorIncomeRows(allRows, {
        from: filters.from,
        to: filters.to,
        propertyId: filters.propertyId,
      }),
    [allRows, filters.from, filters.to, filters.propertyId],
  );

  const financeTabItems = useMemo(
    () => VENDOR_FINANCE_TABS.map((tab) => ({ ...tab, href: `${basePath}/financials/${tab.id}` })),
    [basePath],
  );

  function onHeaderSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "date" || key === "total" || key === "labor" || key === "materials" ? "desc" : "asc");
    }
  }

  if (tabId !== "income") {
    return (
      <ManagerPortalPageShell title="Finances">
        <PortalDataTableEmpty message="This finances view is not available." icon="finance" />
      </ManagerPortalPageShell>
    );
  }

  return (
    <ManagerPortalPageShell
      title="Finances"
      filterRow={
        <ManagerPortalFilterRow>
          <TabNav activeId={tabId} items={financeTabItems} />
        </ManagerPortalFilterRow>
      }
    >
      <div className="space-y-5">
        <ReportFilterBar
          showProperty
          showDateRange
          showDaysAhead={false}
          showTaxYear={false}
          propertyOptions={propertyOptions}
          filters={filters}
          onChange={(next) => setFilters((f) => ({ ...f, ...next }))}
          onRun={() => undefined}
          showRunButton={false}
        />

        {filteredRows.length === 0 && allRows.length > 0 ? (
          <PortalDataTableEmpty message="No income entries match these filters yet." icon="finance" />
        ) : (
          <VendorIncomeTable
            rows={filteredRows}
            sortKey={sortKey}
            sortDir={sortDir}
            onHeaderSort={onHeaderSort}
          />
        )}
      </div>
    </ManagerPortalPageShell>
  );
}
