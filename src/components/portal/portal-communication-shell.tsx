"use client";

import type { ReactNode } from "react";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalListControlStack } from "@/components/portal/portal-list-control-stack";
import { useCommunicationSurfaceChrome } from "@/hooks/use-communication-surface-chrome";
import { cn } from "@/lib/utils";

/**
 * Communication page chrome — Appendix C1 control stack above the inbox body.
 */
export function PortalCommunicationShell({
  title,
  controlStack,
  /** @deprecated Prefer `controlStack`. Kept for resident/vendor/admin shells. */
  titleAside,
  titleInlineFilter,
  /** @deprecated Prefer `controlStack`. */
  threadFilters,
  children,
  hideMobileFilterRow = false,
  compactFilterRow = true,
  mobileThreadReading = false,
  hideTitleOnMobileNav = true,
  mobileActionsRow,
}: {
  title: string;
  controlStack?: ReactNode;
  titleAside?: ReactNode;
  titleInlineFilter?: ReactNode;
  threadFilters?: ReactNode;
  children: ReactNode;
  hideMobileFilterRow?: boolean;
  compactFilterRow?: boolean;
  mobileThreadReading?: boolean;
  hideTitleOnMobileNav?: boolean;
  /** Full-width mobile action row (Filter | primary) above list chrome. */
  mobileActionsRow?: ReactNode;
}) {
  const resolvedStack =
    controlStack ??
    (threadFilters ? <PortalListControlStack filterRow={threadFilters} /> : null);

  useCommunicationSurfaceChrome({ active: true, threadReading: mobileThreadReading });

  return (
    <ManagerPortalPageShell
      title={title}
      titleAside={titleAside}
      titleInlineFilter={titleInlineFilter}
      hideTitleOnMobileNav={hideTitleOnMobileNav}
      compactFilterRow={compactFilterRow}
      mobileHideFilterRow={hideMobileFilterRow}
      mobileFlush={mobileThreadReading}
      mobileThreadFill={mobileThreadReading}
    >
      {mobileActionsRow && !hideMobileFilterRow ? mobileActionsRow : null}
      {resolvedStack ? (
        <div className={hideMobileFilterRow ? "mb-2 max-md:hidden" : "mb-2"}>{resolvedStack}</div>
      ) : null}
      <div
        className={cn(
          "portal-communication-inbox max-md:mt-0 max-md:-mx-0.5 md:mt-1",
          mobileThreadReading && "max-md:flex max-md:min-h-0 max-md:flex-1 max-md:flex-col",
        )}
      >
        {children}
      </div>
    </ManagerPortalPageShell>
  );
}
