import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";

/**
 * Standard portal list-section layout — use for new tabs and data tables.
 *
 * 1. Shell — `ManagerPortalPageShell` with `title` and optional `titleAside` (`PortalSectionPrimaryButton`).
 * 2. Filters — optional `ManagerPortalStatusPills`, `ManagerPortalFilterRow`, or property filter in `filterRow`.
 * 3. Table — `PORTAL_DATA_TABLE_WRAP` + `PORTAL_DATA_TABLE_SCROLL` + `<table>` with `PORTAL_TABLE_HEAD_ROW` headers.
 * 4. Empty — `PortalDataTableEmpty` when there are no rows (do not render headers over an empty nested box).
 * 5. Rows — summary rows use `PORTAL_TABLE_TR_EXPANDABLE` + `createPortalRowExpandClick`; detail rows use `PORTAL_TABLE_DETAIL_ROW`.
 * 6. Actions — primary create/edit in a `Modal`; keep quick row actions (delete, mark paid) in the row with buttons (clicks are ignored for expand).
 *
 * @example
 * <ManagerPortalPageShell
 *   title="Vendors"
 *   titleAside={<PortalSectionPrimaryButton onClick={() => setAddOpen(true)}>Add vendor</PortalSectionPrimaryButton>}
 *   filterRow={<ManagerPortalStatusPills ... />}
 * >
 *   {rows.length === 0 ? <PortalDataTableEmpty message="..." /> : <table>...</table>}
 * </ManagerPortalPageShell>
 */

/** Primary header action (Add …, New …, Compose …). */
export function PortalSectionPrimaryButton({
  className,
  children,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="primary"
      className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}${className ? ` ${className}` : ""}`}
      {...props}
    >
      {children}
    </Button>
  );
}

export type PortalListSectionShellProps = {
  title: string;
  subtitle?: string;
  primaryAction?: ReactNode;
  filterRow?: ReactNode;
  children: ReactNode;
};
