"use client";

import { Fragment, type ReactNode } from "react";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import { cn } from "@/lib/utils";
import {
  PORTAL_DATA_TABLE,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_TR_EXPANDABLE,
  PortalDataTableColGroup,
  PortalTableExpandChevron,
  createPortalRowExpandClick,
  isPortalRowClickIgnored,
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

/** Bank of America–style two-line payment row: payee, then date · category; amount right. */
function PaymentTransactionSummary({
  row,
  expanded,
  settled,
  renderChargeCell,
  renderDueDateCell,
  renderAmountCell,
  expandControl,
}: {
  row: PortalPaymentTableRow;
  expanded: boolean;
  settled?: boolean;
  renderChargeCell?: (row: PortalPaymentTableRow, expanded: boolean) => ReactNode;
  renderDueDateCell?: (row: PortalPaymentTableRow) => ReactNode;
  renderAmountCell?: (row: PortalPaymentTableRow) => ReactNode;
  expandControl?: ReactNode;
}) {
  const chargeLabel = renderChargeCell ? renderChargeCell(row, expanded) : row.charge;
  const dueLabel = renderDueDateCell ? renderDueDateCell(row) : row.dueDate;

  return (
    <div className={cn("flex min-w-0 items-center gap-3", settled && "opacity-90")}>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          <p className="min-w-0 truncate text-[15px] font-semibold leading-tight text-foreground">
            {row.payee}
          </p>
          {expandControl}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          <span>{dueLabel}</span>
          <span className="mx-1.5 text-muted/50" aria-hidden>·</span>
          <span className="truncate">{chargeLabel}</span>
        </p>
        {settled ? (
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--status-confirmed-fg)]">
            Posted
          </p>
        ) : null}
      </div>
      <div className="shrink-0 self-center text-right">
        <div
          className={cn(
            "text-base font-bold tabular-nums leading-none",
            settled ? "text-[var(--status-confirmed-fg)]" : "text-foreground",
          )}
        >
          {renderAmountCell ? renderAmountCell(row) : row.amount}
        </div>
      </div>
    </div>
  );
}

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
  expandOnRowClick = false,
  settledAppearance = false,
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
  /** When true, clicking the summary row/card toggles expand (checkbox and buttons are excluded). */
  expandOnRowClick?: boolean;
  /** Visual treatment for posted/settled rows (paid bucket). */
  settledAppearance?: boolean;
}) {
  const showSelection = Boolean(selection && rows.length > 0);
  const colSpan = 5 + (showSelection ? 1 : 0);

  const toggleExpand = (rowId: string, expanded: boolean) => onExpand(expanded ? null : rowId);

  return (
    <>
      <div className="space-y-2 lg:hidden">
        {rows.map((row) => {
          const expanded = expandedId === row.id;
          const expandControl = expandOnRowClick
            ? (
              <span className="shrink-0 rounded p-0.5 text-muted" aria-hidden>
                <PortalTableExpandChevron expanded={expanded} />
              </span>
            )
            : (
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted hover:bg-accent/50 hover:text-foreground"
                onClick={() => toggleExpand(row.id, expanded)}
                aria-expanded={expanded}
                aria-label={expanded ? `Collapse ${row.charge}` : `Expand ${row.charge}`}
                data-portal-row-ignore
              >
                <PortalTableExpandChevron expanded={expanded} />
              </button>
            );
          const summaryContent = (
            <PaymentTransactionSummary
              row={row}
              expanded={expanded}
              settled={settledAppearance}
              renderChargeCell={renderChargeCell}
              renderDueDateCell={renderDueDateCell}
              renderAmountCell={renderAmountCell}
              expandControl={expandControl}
            />
          );

          return (
            <div key={row.id} className={PORTAL_MOBILE_CARD_CLASS}>
              <div className="flex items-center gap-3">
                {showSelection ? (
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 rounded border-border"
                    checked={selection!.selectedIds.has(row.id)}
                    onChange={() => selection!.onToggle(row.id)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={selection!.selectLabel?.(row) ?? `Select ${row.charge}`}
                  />
                ) : null}
                {expandOnRowClick ? (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    aria-label={expanded ? `Collapse ${row.charge}` : `Expand ${row.charge}`}
                    className="portal-pressable min-w-0 flex-1 cursor-pointer text-left"
                    onClick={() => toggleExpand(row.id, expanded)}
                    onKeyDown={(event) => {
                      if (isPortalRowClickIgnored(event.target)) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleExpand(row.id, expanded);
                      }
                    }}
                  >
                    {summaryContent}
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">{summaryContent}</div>
                )}
              </div>
              {expanded ? (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="mb-2 text-xs text-muted lg:hidden">{row.property}</p>
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
                      className={expandOnRowClick ? PORTAL_TABLE_TR_EXPANDABLE : PORTAL_TABLE_TR}
                      onClick={
                        expandOnRowClick
                          ? createPortalRowExpandClick(() => toggleExpand(row.id, expanded))
                          : undefined
                      }
                      aria-expanded={expandOnRowClick ? expanded : undefined}
                    >
                      {showSelection ? (
                        <td className={PORTAL_TABLE_TD}>
                          <input
                            type="checkbox"
                            className="size-4 rounded border-border"
                            checked={selection!.selectedIds.has(row.id)}
                            onChange={() => selection!.onToggle(row.id)}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={selection!.selectLabel?.(row) ?? `Select ${row.charge}`}
                          />
                        </td>
                      ) : null}
                      <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>
                        <div className="flex min-w-0 items-start gap-1.5">
                          <div className="min-w-0">
                            {renderChargeCell ? renderChargeCell(row, expanded) : row.charge}
                          </div>
                          {expandOnRowClick ? (
                            <span className="mt-0.5 shrink-0 rounded p-0.5 text-muted" aria-hidden>
                              <PortalTableExpandChevron expanded={expanded} />
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="mt-0.5 shrink-0 rounded p-0.5 text-muted hover:bg-accent/50 hover:text-foreground"
                              onClick={() => toggleExpand(row.id, expanded)}
                              aria-expanded={expanded}
                              aria-label={expanded ? `Collapse ${row.charge}` : `Expand ${row.charge}`}
                            >
                              <PortalTableExpandChevron expanded={expanded} />
                            </button>
                          )}
                        </div>
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
