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
  channelNav: ReactNode;
  threadFilters?: ReactNode;
  statusPills: ReactNode;
  children: ReactNode;
}) {
  return (
    <ManagerPortalPageShell
      title={title}
      titleAside={titleAside}
      filterRow={
        <ManagerPortalFilterRow>
          <div className="w-fit shrink-0">{channelNav}</div>
          {threadFilters}
        </ManagerPortalFilterRow>
      }
    >
      <div className="mt-1">
        {statusPills ? <div className="mb-4">{statusPills}</div> : null}
        {children}
      </div>
    </ManagerPortalPageShell>
  );
}
