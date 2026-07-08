"use client";

import { Fragment, type ReactNode } from "react";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR_EXPANDABLE,
  PortalDataTableColGroup,
  PortalTableExpandChevron,
  PortalTableInlineExpand,
  createPortalRowExpandClick,
  portalTableColumnPercents,
} from "@/components/portal/portal-data-table";

/** Charge, Property, Payee, Due date, Amount. */
const PAYMENTS_COLUMN_WEIGHTS = [26, 20, 20, 18, 16] as const;

export type PortalPaymentTableRow = {
  id: string;
  charge: string;
  property: string;
  payee: string;
  dueDate: string;
  amount: string;
};

export type PortalPaymentsTableSelection = {
  selectedIds: Set<string>;
  allSelected: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  selectLabel?: (row: PortalPaymentTableRow) => string;
};

export function PortalPaymentsTable({
  rows,
  expandedId,
  onExpand,
  renderExpandedActions,
  renderExpandedDetail,
  selection,
  renderChargeCell,
  renderDueDateCell,
  renderAmountCell,
}: {
  rows: PortalPaymentTableRow[];
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  renderExpandedActions: (row: PortalPaymentTableRow) => ReactNode;
  renderExpandedDetail?: (row: PortalPaymentTableRow) => ReactNode;
  selection?: PortalPaymentsTableSelection;
  renderChargeCell?: (row: PortalPaymentTableRow, expanded: boolean) => ReactNode;
  renderDueDateCell?: (row: PortalPaymentTableRow) => ReactNode;
  renderAmountCell?: (row: PortalPaymentTableRow) => ReactNode;
}) {
  const showSelection = Boolean(selection && rows.length > 0);
  const colSpan = 5 + (showSelection ? 1 : 0);

  return (
    <>
      <div className="space-y-2 lg:hidden">
        {rows.map((row) => {
          const expanded = expandedId === row.id;
          return (
            <div key={row.id} className={PORTAL_MOBILE_CARD_CLASS}>
              <div className="flex items-start gap-3">
                {showSelection ? (
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 rounded border-border"
                    checked={selection!.selectedIds.has(row.id)}
                    onChange={() => selection!.onToggle(row.id)}
                    aria-label={selection!.selectLabel?.(row) ?? `Select ${row.charge}`}
                  />
                ) : null}
                <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start gap-1.5">
                      <div className="min-w-0 flex-1 truncate font-semibold text-foreground">
                        {renderChargeCell ? renderChargeCell(row, expanded) : row.charge}
                      </div>
                      <button
                        type="button"
                        className="mt-0.5 shrink-0 rounded p-0.5 text-muted hover:bg-accent/50 hover:text-foreground"
                        onClick={() => onExpand(expanded ? null : row.id)}
                        aria-expanded={expanded}
                        aria-label={expanded ? `Collapse ${row.charge}` : `Expand ${row.charge}`}
                      >
                        <PortalTableExpandChevron expanded={expanded} />
                      </button>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">{row.property}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">{row.payee}</p>
                    <div className="mt-0.5 text-xs text-muted">
                      {renderDueDateCell ? renderDueDateCell(row) : row.dueDate}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-base font-bold tabular-nums text-foreground">
                      {renderAmountCell ? renderAmountCell(row) : row.amount}
                    </div>
                  </div>
                </div>
              </div>
              {expanded ? (
                <div className="mt-3 border-t border-border pt-3">
                  {renderExpandedActions(row)}
                  {renderExpandedDetail ? <div className="mt-3">{renderExpandedDetail(row)}</div> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className={PORTAL_DATA_TABLE}>
            <PortalDataTableColGroup
              percents={
                showSelection
                  ? portalTableColumnPercents(6, [3, ...PAYMENTS_COLUMN_WEIGHTS])
                  : portalTableColumnPercents(5, PAYMENTS_COLUMN_WEIGHTS)
              }
            />
            <thead>
              <tr className={PORTAL_TABLE_HEAD_ROW}>
                {showSelection ? (
                  <th className={`${MANAGER_TABLE_TH} w-10 text-left`}>
                    <input
                      type="checkbox"
                      className="size-4 rounded border-border"
                      checked={selection!.allSelected}
                      onChange={selection!.onToggleAll}
                      aria-label="Select all payments"
                    />
                  </th>
                ) : null}
                <th className={`${MANAGER_TABLE_TH} text-left`}>Charge</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Payee</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Due date</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const expanded = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={PORTAL_TABLE_TR_EXPANDABLE}
                      onClick={createPortalRowExpandClick(() => onExpand(expanded ? null : row.id))}
                      aria-expanded={expanded}
                    >
                      {showSelection ? (
                        <td className={PORTAL_TABLE_TD} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="size-4 rounded border-border"
                            checked={selection!.selectedIds.has(row.id)}
                            onChange={() => selection!.onToggle(row.id)}
                            aria-label={selection!.selectLabel?.(row) ?? `Select ${row.charge}`}
                          />
                        </td>
                      ) : null}
                      <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>
                        {renderChargeCell ? (
                          renderChargeCell(row, expanded)
                        ) : (
                          <PortalTableInlineExpand expanded={expanded}>{row.charge}</PortalTableInlineExpand>
                        )}
                      </td>
                      <td className={`${PORTAL_TABLE_TD} text-muted`}>{row.property}</td>
                      <td className={PORTAL_TABLE_TD}>{row.payee}</td>
                      <td className={`${PORTAL_TABLE_TD} text-muted`}>
                        {renderDueDateCell ? renderDueDateCell(row) : row.dueDate}
                      </td>
                      <td className={`${PORTAL_TABLE_TD} tabular-nums font-semibold text-foreground`}>
                        {renderAmountCell ? renderAmountCell(row) : row.amount}
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className={PORTAL_TABLE_DETAIL_ROW}>
                        <td colSpan={colSpan} className={PORTAL_TABLE_DETAIL_CELL}>
                          {renderExpandedActions(row)}
                          {renderExpandedDetail ? <div className="mt-3">{renderExpandedDetail(row)}</div> : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
