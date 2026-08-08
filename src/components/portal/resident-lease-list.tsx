"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MANAGER_TABLE_TH, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import {
  PORTAL_TABLE_TD,
  PortalDataTableEmpty,
  PortalMobileSummaryCard,
  PortalTableInlineExpand,
} from "@/components/portal/portal-data-table";
import { DocumentsTableShell } from "@/components/portal/documents-table-shell";
import { usePortalSession } from "@/hooks/use-portal-session";
import { portalNavClick, prefetchPortalHref, usePortalNavigate } from "@/lib/portal-nav-client";
import {
  LEASE_PIPELINE_EVENT,
  findLeaseForResidentEmail,
  residentCanViewLeaseRow,
  residentLeaseAuthorized,
  syncLeasePipelineFromServer,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";
import {
  MANAGER_APPLICATIONS_EVENT,
  readManagerApplicationRows,
  resolveResidentPortalAxisId,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import { getPropertyById } from "@/lib/rental-application/data";
import {
  buildResidentLeaseDocumentRows,
  filterResidentLeaseDocumentRows,
  residentLeaseStatusFilterTabs,
  type ResidentLeaseDocumentRow,
  type ResidentLeaseStatusFilter,
} from "@/lib/resident-lease-documents";
import { residentLeaseDetailHref } from "@/lib/portal-detail-routes";
import { RESIDENT_PORTAL_BASE_PATH } from "@/lib/portals/resident-sections";
import { safeFormatDateTime } from "@/lib/pacific-time";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function useResidentLeasePipelineRow(): LeasePipelineRow | null {
  const session = usePortalSession();
  const email = session.email?.trim().toLowerCase() ?? "";
  const userId = session.userId ?? null;
  const [tick, setTick] = useState(0);
  const [residentAxisId, setResidentAxisId] = useState<string | null>(null);
  const [profileManagerId, setProfileManagerId] = useState<string | null>(null);
  const [axisResolved, setAxisResolved] = useState(false);

  useEffect(() => {
    const on = () => setTick((value) => value + 1);
    void syncLeasePipelineFromServer().then(on);
    window.addEventListener(LEASE_PIPELINE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(LEASE_PIPELINE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  useEffect(() => {
    if (!email) {
      queueMicrotask(() => {
        setResidentAxisId(null);
        setProfileManagerId(null);
        setAxisResolved(true);
      });
      return;
    }

    let cancelled = false;
    void (async () => {
      const matchingApplication = readManagerApplicationRows()
        .filter((row) => row.email?.trim().toLowerCase() === email)
        .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))[0];

      await syncManagerApplicationsFromServer({ selfScope: true }).catch(() => undefined);

      const supabase = createSupabaseBrowserClient();
      const { data: profile } = await supabase
        .from("profiles")
        .select("manager_id")
        .eq("id", userId ?? "")
        .maybeSingle();

      if (cancelled) return;
      setResidentAxisId(resolveResidentPortalAxisId({ applicationRowId: matchingApplication?.id }));
      setProfileManagerId(typeof profile?.manager_id === "string" ? profile.manager_id : null);
      setAxisResolved(true);
    })();

    const onApps = () => setTick((value) => value + 1);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, onApps);
    return () => {
      cancelled = true;
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, onApps);
    };
  }, [email, userId]);

  return useMemo(() => {
    void tick;
    if (!email || !axisResolved) return null;
    const row = findLeaseForResidentEmail(email, {
      email,
      residentAxisId,
      profileManagerId,
    });
    if (!row) return null;
    if (!residentLeaseAuthorized(row, { email, residentAxisId, profileManagerId })) return null;
    if (!residentCanViewLeaseRow(row)) return null;
    return row;
  }, [axisResolved, email, profileManagerId, residentAxisId, tick]);
}

function leaseDocumentPropertyLabel(pipelineRow: LeasePipelineRow | null): string {
  if (!pipelineRow) return "—";
  const propertyId = pipelineRow.propertyId ?? pipelineRow.application?.propertyId ?? "";
  const title = propertyId ? getPropertyById(propertyId)?.title?.trim() : "";
  if (title) return title;
  const unit = pipelineRow.unit?.trim();
  return unit && unit !== "—" ? unit : "—";
}

function resolveLeaseDetailHref(
  basePath: string,
  entry: ResidentLeaseDocumentRow,
  detailHref: (basePath: string, leaseDetailId: string) => string,
  routePendingToLeaseSection: boolean,
): string {
  if (routePendingToLeaseSection && entry.filterBucket === "pending") {
    return residentLeaseDetailHref(RESIDENT_PORTAL_BASE_PATH, entry.id);
  }
  return detailHref(basePath, entry.id);
}

export function ResidentLeaseListTable({
  basePath,
  detailHref,
  emptyMessage = "Your lease will appear here once your manager sends it for review.",
  routePendingToLeaseSection = false,
  statusFilter = "all",
}: {
  basePath: string;
  detailHref: (basePath: string, leaseDetailId: string) => string;
  emptyMessage?: string;
  /** Pending rows open the Lease section (signing workflow) instead of Documents. */
  routePendingToLeaseSection?: boolean;
  statusFilter?: ResidentLeaseStatusFilter;
}) {
  const router = useRouter();
  const navigate = usePortalNavigate();
  const pipelineRow = useResidentLeasePipelineRow();
  const documentRows = useMemo(() => {
    const rows = buildResidentLeaseDocumentRows(pipelineRow);
    return filterResidentLeaseDocumentRows(rows, statusFilter);
  }, [pipelineRow, statusFilter]);
  const propertyLabel = useMemo(() => leaseDocumentPropertyLabel(pipelineRow), [pipelineRow]);

  const leaseDetailPath = useCallback(
    (entry: ResidentLeaseDocumentRow) =>
      resolveLeaseDetailHref(basePath, entry, detailHref, routePendingToLeaseSection),
    [basePath, detailHref, routePendingToLeaseSection],
  );

  const openLease = useCallback(
    (entry: ResidentLeaseDocumentRow) => {
      navigate(leaseDetailPath(entry));
    },
    [leaseDetailPath, navigate],
  );

  if (documentRows.length === 0) {
    return <PortalDataTableEmpty icon="lease" message={emptyMessage} />;
  }

  return (
    <DocumentsTableShell
      hideColumnHeaders
      colSpan={3}
      head={
        <>
          <th className={`${MANAGER_TABLE_TH} text-left`}>Name</th>
          <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
          <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
        </>
      }
      rows={documentRows.map((entry) => {
        const href = leaseDetailPath(entry);
        return {
          key: entry.id,
          expanded: false,
          detail: null,
          onToggle: () => openLease(entry),
          cells: (
            <>
              <td className={`${PORTAL_TABLE_TD} align-middle`}>
                <Link
                  href={href}
                  className="block min-w-0 text-left"
                  onClick={portalNavClick(router, href)}
                  onMouseEnter={() => prefetchPortalHref(router, href)}
                  onFocus={() => prefetchPortalHref(router, href)}
                >
                  <PortalTableInlineExpand expanded={false} className="min-w-0 truncate font-medium text-foreground">
                    <span className="truncate">{entry.label}</span>
                  </PortalTableInlineExpand>
                </Link>
              </td>
              <td className={`${PORTAL_TABLE_TD} align-middle`}>{entry.status}</td>
              <td className={`${PORTAL_TABLE_TD} align-middle`}>
                <p className="min-w-0 truncate">{propertyLabel}</p>
              </td>
            </>
          ),
          card: (
            <PortalMobileSummaryCard
              title={entry.label}
              subtitle={entry.status}
              meta={propertyLabel}
              onClick={() => openLease(entry)}
            />
          ),
        };
      })}
    />
  );
}

export function ResidentLeaseListSection({
  basePath,
  detailHref,
  emptyMessage,
  routePendingToLeaseSection = false,
}: {
  basePath: string;
  detailHref: (basePath: string, leaseDetailId: string) => string;
  emptyMessage?: string;
  routePendingToLeaseSection?: boolean;
}) {
  const pipelineRow = useResidentLeasePipelineRow();
  const allRows = useMemo(() => buildResidentLeaseDocumentRows(pipelineRow), [pipelineRow]);
  const filterTabs = useMemo(() => residentLeaseStatusFilterTabs(allRows), [allRows]);
  const showFilters = filterTabs.some((tab) => tab.id !== "all" && tab.count > 0) && allRows.length > 1;
  const [statusFilter, setStatusFilter] = useState<ResidentLeaseStatusFilter>("all");

  useEffect(() => {
    if (statusFilter === "all") return;
    const active = filterTabs.find((tab) => tab.id === statusFilter);
    if (!active || active.count === 0) {
      queueMicrotask(() => setStatusFilter("all"));
    }
  }, [filterTabs, statusFilter]);

  return (
    <div className="space-y-3">
      {showFilters ? (
        <ManagerPortalStatusPills
          tabs={filterTabs}
          activeId={statusFilter}
          onChange={(id) => setStatusFilter(id as ResidentLeaseStatusFilter)}
          activeTone="monochrome"
          compact
          selectAriaLabel="Lease status"
        />
      ) : null}
      <ResidentLeaseListTable
        basePath={basePath}
        detailHref={detailHref}
        emptyMessage={emptyMessage}
        routePendingToLeaseSection={routePendingToLeaseSection}
        statusFilter={statusFilter}
      />
    </div>
  );
}

export function residentLeaseListMeta(entry: ResidentLeaseDocumentRow): string {
  return [entry.status, safeFormatDateTime(entry.signedAt)].filter(Boolean).join(" · ");
}
