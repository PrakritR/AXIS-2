import { Fragment, type ReactNode } from "react";
import {
  PORTAL_DATA_TABLE,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
} from "@/components/portal/portal-data-table";

/** One row in a {@link DocumentsTableShell}: its cells, mobile card, and the inline detail shown when open. */
export type DocumentsTableRow = {
  key: string;
  /** Desktop `<td>` cells (no wrapping `<tr>` — the shell owns the row). */
  cells: ReactNode;
  /** Mobile summary card. */
  card: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  /** Inline detail rendered directly BENEATH this row (desktop) / card (mobile) when expanded. */
  detail: ReactNode;
};

/**
 * Shared table shell so every Documents tab (Application, Rent receipts, Lease,
 * and — via the same pattern — Other documents) renders identically. A
 * `space-y-2 lg:hidden` mobile card stack sits above the `lg:` desktop table so
 * neither layout scrolls horizontally on small screens.
 *
 * Crucially, an expanded row's detail is rendered DIRECTLY under that row — a
 * `PORTAL_TABLE_DETAIL_ROW` immediately after the row on desktop, and after its
 * card on mobile — never as a sibling below the whole table. Rendering it below
 * the table made the detail "open way below" the clicked row once a table had
 * more than one row, which read as the row not opening inline at all.
 */
export function DocumentsTableShell({
  head,
  colSpan,
  rows,
}: {
  head: ReactNode;
  /** Column count, for the full-width detail row's `colSpan`. */
  colSpan: number;
  rows: DocumentsTableRow[];
}) {
  return (
    <>
      <div className="space-y-2 lg:hidden">
        {rows.map((row) => (
          <Fragment key={row.key}>
            {row.card}
            {row.expanded ? row.detail : null}
          </Fragment>
        ))}
      </div>
      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className={PORTAL_DATA_TABLE}>
            <thead>
              <tr className={PORTAL_TABLE_HEAD_ROW}>{head}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.key}>
                  <tr
                    className={PORTAL_TABLE_TR_EXPANDABLE}
                    aria-expanded={row.expanded}
                    onClick={row.onToggle}
                  >
                    {row.cells}
                  </tr>
                  {row.expanded ? (
                    <tr className={PORTAL_TABLE_DETAIL_ROW}>
                      <td colSpan={colSpan} className={PORTAL_TABLE_DETAIL_CELL}>
                        {row.detail}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
