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
}: {
  title: string;
  titleAside?: ReactNode;
  /** Email/SMS channel tabs removed — unified inbox uses folder pills only. */
  channelNav?: ReactNode;
  threadFilters?: ReactNode;
  /** Legacy folder tabs; omitted in the unified conversation inbox. */
  statusPills?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ManagerPortalPageShell
      title={title}
      titleAside={titleAside}
      filterRow={
        threadFilters || channelNav ? (
          <ManagerPortalFilterRow>
            {channelNav ? <div className="w-fit shrink-0">{channelNav}</div> : null}
            {threadFilters}
          </ManagerPortalFilterRow>
        ) : undefined
      }
    >
      <div className="portal-communication-inbox mt-1">
        {statusPills ? <div className="mb-4">{statusPills}</div> : null}
        {children}
      </div>
    </ManagerPortalPageShell>
  );
}
