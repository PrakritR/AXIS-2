"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_EXPAND_TH,
  PortalDataTableEmpty,
  PortalMobileSummaryCard,
  PortalTableExpandCell,
} from "@/components/portal/portal-data-table";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { DocumentInlineViewer, triggerDocumentDownload } from "@/components/portal/resident-other-documents";
import type { DemoApplicantRow, ManagerApplicationBucket } from "@/data/demo-portal";
import {
  MANAGER_APPLICATIONS_EVENT,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import {
  MANAGER_PORTFOLIO_REFRESH_EVENTS,
  applicationVisibleToPortalUser,
  buildManagerPropertyFilterOptions,
  leaseVisibleToPortalUser,
} from "@/lib/manager-portfolio-access";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import {
  fetchCosignerSubmissionsForSignerAppId,
  readCosignerSubmissionsForSignerAppId,
  type CosignerSubmission,
} from "@/lib/cosigner-submissions-storage";
import { buildApplicationHtml } from "@/lib/manager-application-html";
import { getRoomChoiceLabel } from "@/lib/rental-application/data";
import {
  LEASE_PIPELINE_EVENT,
  downloadLeaseFromRow,
  getLeaseDocumentHtml,
  readLeasePipeline,
  syncLeasePipelineFromServer,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";
import { safeFormatDateTime } from "@/lib/pacific-time";
import { isDemoModeActive } from "@/lib/demo/demo-session";

function DocumentsTableShell({
  head,
  children,
  mobile,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  mobile: React.ReactNode;
}) {
  return (
    <>
      <div className="space-y-2 lg:hidden">{mobile}</div>
      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <thead>
              <tr className={PORTAL_TABLE_HEAD_ROW}>{head}</tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function applicationStatusLabel(bucket: ManagerApplicationBucket): string {
  if (bucket === "approved") return "Approved";
  if (bucket === "rejected") return "Rejected";
  return "Pending review";
}

function applicationRoomLabel(row: DemoApplicantRow): string {
  const roomChoice = row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "";
  return getRoomChoiceLabel(roomChoice);
}

function applicationPdfHref(row: DemoApplicantRow): string {
  const params = new URLSearchParams();
  const roomLabel = applicationRoomLabel(row);
  if (roomLabel) params.set("roomLabel", roomLabel);
  const query = params.toString();
  return `/api/manager-applications/${encodeURIComponent(row.id)}/pdf${query ? `?${query}` : ""}`;
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

export function ManagerApplicationDocumentsTab({ userId }: { userId: string | null }) {
  const [tick, setTick] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [propertyTick, setPropertyTick] = useState(0);
  const [preview, setPreview] = useState<DemoApplicantRow | null>(null);
  const [previewCosignerSubmissions, setPreviewCosignerSubmissions] = useState<CosignerSubmission[]>([]);
  const demoMode = isDemoModeActive();
  const demoPdfCache = useRef(new Map<string, string>());

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    void syncManagerApplicationsFromServer().then(refresh);
    void syncPropertyPipelineFromServer().then(() => setPropertyTick((n) => n + 1));
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

  useEffect(() => {
    setPreviewCosignerSubmissions([]);
    if (!preview || preview.application?.hasCosigner !== "yes") return;
    if (demoMode) {
      setPreviewCosignerSubmissions(readCosignerSubmissionsForSignerAppId(preview.id));
      return;
    }
    let cancelled = false;
    void fetchCosignerSubmissionsForSignerAppId(preview.id).then((rows) => {
      if (!cancelled) setPreviewCosignerSubmissions(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [preview, demoMode]);

  const propertyOptions = useMemo(() => {
    void propertyTick;
    return buildManagerPropertyFilterOptions(userId);
  }, [userId, propertyTick]);

  const rows = useMemo(() => {
    void tick;
    if (!userId) return [];
    return readManagerApplicationRows()
      .filter((row) => applicationVisibleToPortalUser(row, userId))
      .filter((row) => !propertyFilter || applicationPropertyId(row) === propertyFilter)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [userId, tick, propertyFilter]);

  const buildDemoPdf = useCallback(async (row: DemoApplicantRow): Promise<string> => {
    const cached = demoPdfCache.current.get(row.id);
    if (cached) return cached;
    const { buildDemoApplicationPdfDataUrl } = await import("@/lib/demo/demo-document-files");
    const cosignerSubmissions =
      row.application?.hasCosigner === "yes" ? readCosignerSubmissionsForSignerAppId(row.id) : [];
    const url = await buildDemoApplicationPdfDataUrl(row, applicationRoomLabel(row) || undefined, cosignerSubmissions);
    demoPdfCache.current.set(row.id, url);
    return url;
  }, []);

  const downloadRow = useCallback(
    (row: DemoApplicantRow) => {
      if (demoMode) {
        void buildDemoPdf(row).then((url) => triggerDocumentDownload(url, `rental-application-${row.id}.pdf`));
        return;
      }
      triggerDocumentDownload(applicationPdfHref(row), `rental-application-${row.id}.pdf`);
    },
    [demoMode, buildDemoPdf],
  );

  const previewHtml = useMemo(
    () =>
      preview
        ? buildApplicationHtml(preview, {
            roomLabel: applicationRoomLabel(preview) || undefined,
            cosignerSubmissions: previewCosignerSubmissions,
          })
        : null,
    [preview, previewCosignerSubmissions],
  );

  if (!userId) {
    return <PortalDataTableEmpty icon="application" message="Sign in to view application documents." />;
  }

  return (
    <div className="space-y-4">
      <PortalPropertyFilterPill
        propertyOptions={propertyOptions}
        propertyValue={propertyFilter}
        onPropertyChange={setPropertyFilter}
      />

      {rows.length === 0 ? (
        <PortalDataTableEmpty icon="application" message="No application documents yet." />
      ) : (
        <>
          <DocumentsTableShell
            head={
              <>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Applicant</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                <th className={PORTAL_TABLE_EXPAND_TH}>
                  <span className="sr-only">Expand</span>
                </th>
              </>
            }
            mobile={rows.map((row) => (
              <PortalMobileSummaryCard
                key={row.id}
                title={row.name || row.email || "Applicant"}
                subtitle={applicationStatusLabel(row.bucket)}
                meta={[row.property, applicationRoomLabel(row)].filter(Boolean).join(" · ") || "—"}
                expanded={preview?.id === row.id}
                onClick={() => setPreview((cur) => (cur?.id === row.id ? null : row))}
              />
            ))}
          >
            {rows.map((row) => (
              <tr
                key={row.id}
                className={PORTAL_TABLE_TR_EXPANDABLE}
                aria-expanded={preview?.id === row.id}
                onClick={() => setPreview((cur) => (cur?.id === row.id ? null : row))}
              >
                <td className={`${PORTAL_TABLE_TD} align-middle`}>
                  <p className="font-medium text-foreground">{row.name || "—"}</p>
                  {row.email ? <p className="mt-0.5 text-xs text-muted">{row.email}</p> : null}
                </td>
                <td className={`${PORTAL_TABLE_TD} align-middle`}>{applicationStatusLabel(row.bucket)}</td>
                <td className={`${PORTAL_TABLE_TD} align-middle`}>
                  <p className="truncate">{row.property || "—"}</p>
                  {applicationRoomLabel(row) ? (
                    <p className="mt-0.5 text-xs text-muted">{applicationRoomLabel(row)}</p>
                  ) : null}
                </td>
                <PortalTableExpandCell expanded={preview?.id === row.id} />
              </tr>
            ))}
          </DocumentsTableShell>

          {preview ? (
            <DocumentInlineViewer
              title={`Application — ${preview.name || preview.id}`}
              srcDoc={previewHtml}
              onDownload={() => downloadRow(preview)}
              downloadLabel="Download PDF"
              downloadAttr="manager-documents-application-download"
            />
          ) : null}
        </>
      )}
    </div>
  );
}

export function ManagerLeaseDocumentsTab({ userId }: { userId: string | null }) {
  const [tick, setTick] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [propertyTick, setPropertyTick] = useState(0);
  const [preview, setPreview] = useState<LeasePipelineRow | null>(null);

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    void syncLeasePipelineFromServer(userId ?? undefined).then(refresh);
    void syncPropertyPipelineFromServer().then(() => setPropertyTick((n) => n + 1));
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

  const propertyOptions = useMemo(() => {
    void propertyTick;
    return buildManagerPropertyFilterOptions(userId);
  }, [userId, propertyTick]);

  const rows = useMemo(() => {
    void tick;
    if (!userId) return [];
    return readLeasePipeline(userId)
      .filter((row) => leaseVisibleToPortalUser(row, userId))
      .filter((row) => !propertyFilter || leasePropertyId(row) === propertyFilter)
      .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
  }, [userId, tick, propertyFilter]);

  if (!userId) {
    return <PortalDataTableEmpty icon="lease" message="Sign in to view lease documents." />;
  }

  const previewPdfSrc = preview?.managerUploadedPdf?.dataUrl ?? null;
  const previewHtml = preview ? getLeaseDocumentHtml(preview) : null;
  const previewLabel = preview
    ? `Lease — ${preview.residentName || preview.residentEmail}${preview.unit ? ` · ${preview.unit}` : ""}`
    : "";

  return (
    <div className="space-y-4">
      <PortalPropertyFilterPill
        propertyOptions={propertyOptions}
        propertyValue={propertyFilter}
        onPropertyChange={setPropertyFilter}
      />

      {rows.length === 0 ? (
        <PortalDataTableEmpty icon="lease" message="No lease documents yet." />
      ) : (
        <>
          <DocumentsTableShell
            head={
              <>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Resident</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Property / unit</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Updated</th>
                <th className={PORTAL_TABLE_EXPAND_TH}>
                  <span className="sr-only">Expand</span>
                </th>
              </>
            }
            mobile={rows.map((row) => (
              <PortalMobileSummaryCard
                key={row.id}
                title={row.residentName || row.residentEmail}
                subtitle={row.stageLabel || row.status}
                meta={[row.unit, safeFormatDateTime(row.updatedAtIso)].filter(Boolean).join(" · ")}
                expanded={preview?.id === row.id}
                onClick={() => setPreview((cur) => (cur?.id === row.id ? null : row))}
              />
            ))}
          >
            {rows.map((row) => (
              <tr
                key={row.id}
                className={PORTAL_TABLE_TR_EXPANDABLE}
                aria-expanded={preview?.id === row.id}
                onClick={() => setPreview((cur) => (cur?.id === row.id ? null : row))}
              >
                <td className={`${PORTAL_TABLE_TD} align-middle`}>
                  <p className="font-medium text-foreground">{row.residentName || "—"}</p>
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
                <PortalTableExpandCell expanded={preview?.id === row.id} />
              </tr>
            ))}
          </DocumentsTableShell>

          {preview ? (
            <DocumentInlineViewer
              title={previewLabel}
              src={previewPdfSrc}
              srcDoc={previewPdfSrc ? null : previewHtml}
              onDownload={() => downloadLeaseFromRow(preview)}
              downloadLabel={previewPdfSrc ? "Download PDF" : "Download / print"}
              downloadAttr="manager-documents-lease-download"
            />
          ) : null}
        </>
      )}
    </div>
  );
}
