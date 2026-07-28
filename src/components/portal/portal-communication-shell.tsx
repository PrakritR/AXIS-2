"use client";

import type { ReactNode } from "react";
import { ManagerPortalFilterRow, ManagerPortalPageShell } from "@/components/portal/portal-metrics";

/**
 * Communication page chrome — same pattern as Services:
 * compact TabNav + filter pills in the filter row, status pills below the divider.
 */
export function PortalCommunicationShell({
  title,
  titleAside,
  channelNav,
  threadFilters,
  statusPills,
  children,
  hideMobileFilterRow = false,
  compactFilterRow = true,
  hideMobileTitleActions = false,
}: {
  title: string;
  titleAside?: ReactNode;
  /** Email/SMS channel tabs removed — unified inbox uses folder pills only. */
  channelNav?: ReactNode;
  threadFilters?: ReactNode;
  /** Legacy folder tabs; omitted in the unified conversation inbox. */
  statusPills?: ReactNode;
  children: ReactNode;
  /** Hide the filter row on phones (e.g. while reading a thread). */
  hideMobileFilterRow?: boolean;
  compactFilterRow?: boolean;
  hideMobileTitleActions?: boolean;
}) {
  const aside =
    titleAside && hideMobileTitleActions ? (
      <div className="max-md:hidden">{titleAside}</div>
    ) : (
      titleAside
    );

  return (
    <ManagerPortalPageShell
      title={title}
      titleAside={aside}
      compactFilterRow={compactFilterRow}
      mobileHideFilterRow={hideMobileFilterRow}
      filterRow={
        threadFilters || channelNav ? (
          <ManagerPortalFilterRow className="mb-0 max-md:gap-2">
            {channelNav ? <div className="w-fit shrink-0">{channelNav}</div> : null}
            {threadFilters}
          </ManagerPortalFilterRow>
        ) : undefined
      }
    >
      <div className="portal-communication-inbox max-md:mt-0 md:mt-1">
        {statusPills ? <div className="mb-4">{statusPills}</div> : null}
        {children}
      </div>
    </ManagerPortalPageShell>
  );
}
