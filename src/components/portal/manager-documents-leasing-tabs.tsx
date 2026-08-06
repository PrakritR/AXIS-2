"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApplicationDocumentPreview } from "@/components/portal/manager-applications";
import { DocumentsTableShell } from "@/components/portal/documents-table-shell";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_TABLE_TD,
  PortalDataTableEmpty,
  PortalMobileSummaryCard,
  PortalTableInlineExpand,
} from "@/components/portal/portal-data-table";
import { DocumentInlineViewer } from "@/components/portal/resident-other-documents";
import type { DemoApplicantRow, ManagerApplicationBucket } from "@/data/demo-portal";
import { applicantDisplayName, applicantSecondaryEmail } from "@/lib/rental-application/applicant-name";
import {
  MANAGER_APPLICATIONS_EVENT,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import {
  MANAGER_PORTFOLIO_REFRESH_EVENTS,
  applicationVisibleToPortalUser,
  leaseVisibleToPortalUser,
} from "@/lib/manager-portfolio-access";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import { getRoomChoiceLabel } from "@/lib/rental-application/data";
import {
  LEASE_PIPELINE_EVENT,
  runLeaseDownload,
  getLeaseDocumentHtml,
  readLeasePipeline,
  syncLeasePipelineFromServer,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";
import { safeFormatDateTime } from "@/lib/pacific-time";
import { useAppUi } from "@/components/providers/app-ui-provider";

function applicationStatusLabel(bucket: ManagerApplicationBucket): string {
  if (bucket === "approved") return "Approved";
  if (bucket === "rejected") return "Rejected";
  return "Pending review";
}

function applicationRoomLabel(row: DemoApplicantRow): string {
  const roomChoice = row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "";
  return getRoomChoiceLabel(roomChoice);
}

function applicationPropertyId(row: DemoApplicantRow): string {
  return row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
}

function leasePropertyId(row: LeasePipelineRow): string {
  return row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
}

function leaseHasDownloadableDocument(row: LeasePipelineRow): boolean {
  return Boolean(row.generatedHtml || row.managerUploadedPdf?.dataUrl);
}

export function ManagerApplicationDocumentsTab({
  userId,
  propertyFilter,
}: {
  userId: string | null;
  propertyFilter: string;
}) {
  const [tick, setTick] = useState(0);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    void syncManagerApplicationsFromServer().then(refresh);
    void syncPropertyPipelineFromServer();
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, refresh);
    for (const event of MANAGER_PORTFOLIO_REFRESH_EVENTS) {
      window.addEventListener(event, refresh);
    }
    return () => {
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, refresh);
      for (const event of MANAGER_PORTFOLIO_REFRESH_EVENTS) {
        window.removeEventListener(event, refresh);
      }
    };
  }, []);

  const rows = useMemo(() => {
    void tick;
    if (!userId) return [];
    return readManagerApplicationRows()
      .filter((row) => applicationVisibleToPortalUser(row, userId))
      .filter((row) => !propertyFilter || applicationPropertyId(row) === propertyFilter)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [userId, tick, propertyFilter]);

  const togglePreview = useCallback((row: DemoApplicantRow) => {
    setPreviewId((cur) => (cur === row.id ? null : row.id));
  }, []);

  if (!userId) {
    return <PortalDataTableEmpty icon="application" message="Sign in to view application documents." />;
  }

  if (rows.length === 0) {
    return <PortalDataTableEmpty icon="application" message="No application documents yet." />;
  }

  return (
    <DocumentsTableShell
      colSpan={3}
      head={
        <>
          <th className={`${MANAGER_TABLE_TH} text-left`}>Applicant</th>
          <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
          <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
        </>
      }
      rows={rows.map((row) => {
        const isOpen = previewId === row.id;
        const toggle = () => togglePreview(row);
        return {
          key: row.id,
          expanded: isOpen,
          onToggle: toggle,
          cells: (
            <>
              <td className={`${PORTAL_TABLE_TD} align-middle`}>
                <PortalTableInlineExpand expanded={isOpen} className="font-medium text-foreground">
                  {applicantDisplayName(row, "—")}
                </PortalTableInlineExpand>
                {applicantSecondaryEmail(row) ? (
                  <p className="mt-0.5 text-xs text-muted">{applicantSecondaryEmail(row)}</p>
                ) : null}
              </td>
              <td className={`${PORTAL_TABLE_TD} align-middle`}>{applicationStatusLabel(row.bucket)}</td>
              <td className={`${PORTAL_TABLE_TD} align-middle`}>
                <p className="truncate">{row.property || "—"}</p>
                {applicationRoomLabel(row) ? (
                  <p className="mt-0.5 text-xs text-muted">{applicationRoomLabel(row)}</p>
                ) : null}
              </td>
            </>
          ),
          card: (
            <PortalMobileSummaryCard
              title={applicantDisplayName(row)}
              subtitle={applicationStatusLabel(row.bucket)}
              meta={[row.property, applicationRoomLabel(row)].filter(Boolean).join(" · ") || "—"}
              expanded={isOpen}
              onClick={toggle}
            />
          ),
          detail: isOpen ? (
            <ApplicationDocumentPreview
              row={row}
              collapsible={false}
              showDownload
              variant="pdf"
              downloadPlacement="bottom"
            />
          ) : null,
        };
      })}
    />
  );
}

export function ManagerLeaseDocumentsTab({
  userId,
  propertyFilter,
}: {
  userId: string | null;
  propertyFilter: string;
}) {
  const { showToast } = useAppUi();
  const [tick, setTick] = useState(0);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    void syncLeasePipelineFromServer(userId ?? undefined).then(refresh);
    void syncPropertyPipelineFromServer();
    window.addEventListener(LEASE_PIPELINE_EVENT, refresh);
    for (const event of MANAGER_PORTFOLIO_REFRESH_EVENTS) {
      window.addEventListener(event, refresh);
    }
    return () => {
      window.removeEventListener(LEASE_PIPELINE_EVENT, refresh);
      for (const event of MANAGER_PORTFOLIO_REFRESH_EVENTS) {
        window.removeEventListener(event, refresh);
      }
    };
  }, [userId]);

  const rows = useMemo(() => {
    void tick;
    if (!userId) return [];
    return readLeasePipeline(userId)
      .filter((row) => leaseVisibleToPortalUser(row, userId))
      .filter((row) => !propertyFilter || leasePropertyId(row) === propertyFilter)
      .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
  }, [userId, tick, propertyFilter]);

  const togglePreview = useCallback((row: LeasePipelineRow) => {
    setPreviewId((cur) => (cur === row.id ? null : row.id));
  }, []);

  if (!userId) {
    return <PortalDataTableEmpty icon="lease" message="Sign in to view lease documents." />;
  }

  if (rows.length === 0) {
    return <PortalDataTableEmpty icon="lease" message="No lease documents yet." />;
  }

  return (
    <DocumentsTableShell
      colSpan={4}
      head={
        <>
          <th className={`${MANAGER_TABLE_TH} text-left`}>Resident</th>
          <th className={`${MANAGER_TABLE_TH} text-left`}>Property / unit</th>
          <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
          <th className={`${MANAGER_TABLE_TH} text-left`}>Updated</th>
        </>
      }
      rows={rows.map((row) => {
        const isOpen = previewId === row.id;
        const toggle = () => togglePreview(row);
        const pdfSrc = row.managerUploadedPdf?.dataUrl ?? null;
        const html = pdfSrc ? null : getLeaseDocumentHtml(row);
        const label = `Lease · ${row.residentName || row.residentEmail}${row.unit ? ` · ${row.unit}` : ""}`;
        return {
          key: row.id,
          expanded: isOpen,
          onToggle: toggle,
          cells: (
            <>
              <td className={`${PORTAL_TABLE_TD} align-middle`}>
                <PortalTableInlineExpand expanded={isOpen} className="font-medium text-foreground">
                  {row.residentName || "—"}
                </PortalTableInlineExpand>
                <p className="mt-0.5 text-xs text-muted">{row.residentEmail}</p>
              </td>
              <td className={`${PORTAL_TABLE_TD} align-middle`}>
                <p className="truncate">{row.unit || "—"}</p>
              </td>
              <td className={`${PORTAL_TABLE_TD} align-middle`}>
                {row.stageLabel || row.status}
                {!leaseHasDownloadableDocument(row) ? (
                  <p className="mt-0.5 text-xs text-muted">No document yet</p>
                ) : null}
              </td>
              <td className={`${PORTAL_TABLE_TD} align-middle text-muted`}>{safeFormatDateTime(row.updatedAtIso)}</td>
            </>
          ),
          card: (
            <PortalMobileSummaryCard
              title={row.residentName || row.residentEmail}
              subtitle={row.stageLabel || row.status}
              meta={[row.unit, safeFormatDateTime(row.updatedAtIso)].filter(Boolean).join(" · ")}
              expanded={isOpen}
              onClick={toggle}
            />
          ),
          detail: isOpen ? (
            <DocumentInlineViewer
              embedded
              actionsPlacement="bottom"
              title={label}
              src={pdfSrc}
              srcDoc={html}
              onDownload={() => runLeaseDownload(row, showToast)}
              downloadLabel={pdfSrc ? "Download PDF" : "Download / print"}
              downloadAttr="manager-documents-lease-download"
            />
          ) : null,
        };
      })}
    />
  );
}
