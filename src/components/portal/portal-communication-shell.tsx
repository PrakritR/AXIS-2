"use client";

import type { ReactNode } from "react";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalListControlStack } from "@/components/portal/portal-list-control-stack";

/**
 * Communication page chrome — Appendix C1 control stack above the inbox body.
 */
export function PortalCommunicationShell({
  title,
  controlStack,
  /** @deprecated Prefer `controlStack`. Kept for resident/vendor/admin shells. */
  titleAside,
  /** @deprecated Prefer `controlStack`. */
  threadFilters,
  children,
  hideMobileFilterRow = false,
  compactFilterRow = true,
  mobileThreadReading = false,
}: {
  title: string;
  controlStack?: ReactNode;
  titleAside?: ReactNode;
  threadFilters?: ReactNode;
  children: ReactNode;
  hideMobileFilterRow?: boolean;
  compactFilterRow?: boolean;
  mobileThreadReading?: boolean;
}) {
  const resolvedStack =
    controlStack ??
    (titleAside || threadFilters ? (
      <PortalListControlStack filterRow={threadFilters} primaryAction={titleAside} />
    ) : null);

  return (
    <ManagerPortalPageShell
      title={title}
      compactFilterRow={compactFilterRow}
      mobileHideFilterRow={hideMobileFilterRow}
      mobileFlush={mobileThreadReading}
    >
      {resolvedStack ? (
        <div className={hideMobileFilterRow ? "mb-3 max-md:hidden" : "mb-3"}>{resolvedStack}</div>
      ) : null}
      <div className="portal-communication-inbox max-md:mt-0 max-md:-mx-0.5 md:mt-1">{children}</div>
    </ManagerPortalPageShell>
  );
}
