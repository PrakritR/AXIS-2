"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_TABLE_TD,
  PortalDataTableEmpty,
  PortalMobileSummaryCard,
} from "@/components/portal/portal-data-table";
import { DocumentsTableShell } from "@/components/portal/documents-table-shell";
import { usePortalSession } from "@/hooks/use-portal-session";
import { usePortalNavigate } from "@/lib/portal-nav-client";
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
  type ResidentLeaseDocumentRow,
} from "@/lib/resident-lease-documents";
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

export function ResidentLeaseListTable({
  basePath,
  detailHref,
  emptyMessage = "Your lease will appear here once your manager sends it for review.",
}: {
  basePath: string;
  detailHref: (basePath: string, leaseDetailId: string) => string;
  emptyMessage?: string;
}) {
  const navigate = usePortalNavigate();
  const pipelineRow = useResidentLeasePipelineRow();
  const documentRows = useMemo(() => buildResidentLeaseDocumentRows(pipelineRow), [pipelineRow]);
  const propertyLabel = useMemo(() => leaseDocumentPropertyLabel(pipelineRow), [pipelineRow]);

  const openLease = useCallback(
    (entry: ResidentLeaseDocumentRow) => {
      navigate(detailHref(basePath, entry.id));
    },
    [basePath, detailHref, navigate],
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
      rows={documentRows.map((entry) => ({
        key: entry.id,
        expanded: false,
        detail: null,
        onToggle: () => openLease(entry),
        cells: (
          <>
            <td className={`${PORTAL_TABLE_TD} align-middle`}>
              <span className="min-w-0 truncate font-medium text-foreground">{entry.label}</span>
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
      }))}
    />
  );
}

export function residentLeaseListMeta(entry: ResidentLeaseDocumentRow): string {
  return [entry.status, safeFormatDateTime(entry.signedAt)].filter(Boolean).join(" · ");
}
