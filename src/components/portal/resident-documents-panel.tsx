"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  MANAGER_TABLE_TH,
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  PORTAL_HEADER_ACTION_BTN,
} from "@/components/portal/portal-metrics";
import { TabNav } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ReportExportButtons } from "@/components/portal/reports/report-filter-bar";
import { ReportGeneratePrompt } from "@/components/portal/reports/report-generate-prompt";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR_EXPANDABLE,
  PortalDataTableEmpty,
  PortalMobileSummaryCard,
} from "@/components/portal/portal-data-table";
import {
  DocumentInlineViewer,
  ResidentAddDocumentModal,
  ResidentOtherDocumentsTable,
  triggerDocumentDownload,
  type AddDocumentMode,
} from "@/components/portal/resident-other-documents";
import { buildApplicationHtml } from "@/lib/manager-application-html";
import {
  fetchCosignerSubmissionsForSignerAppId,
  readCosignerSubmissionsForSignerAppId,
  type CosignerSubmission,
} from "@/lib/cosigner-submissions-storage";
import { buildRentReceiptHtml } from "@/lib/rent-receipt-html";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { usePortalSession } from "@/hooks/use-portal-session";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import {
  MANAGER_APPLICATIONS_EVENT,
  readManagerApplicationRows,
  resolveResidentPortalAxisId,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import type { DemoApplicantRow, ManagerApplicationBucket } from "@/data/demo-portal";
import {
  LEASE_PIPELINE_EVENT,
  downloadLeaseFromRow,
  findLeaseForResidentEmail,
  getLeaseDocumentHtml,
  hasBothLeaseSignatures,
  syncLeasePipelineFromServer,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";
import {
  readUploadedOwnLeases,
  removeUploadedOwnLease,
  syncUploadedOwnLeasesFromServer,
  type UploadedOwnLease,
} from "@/lib/resident-lease-upload";
import { getRoomChoiceLabel } from "@/lib/rental-application/data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { safeFormatDateTime } from "@/lib/pacific-time";
import type { ReportResult } from "@/lib/reports/types";
import { readChargesForResident } from "@/lib/household-charges";
import { DEMO_RESIDENT_NAME, isDemoModeActive } from "@/lib/demo/demo-session";

function defaultReceiptRange() {
  const now = new Date();
  const from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

/**
 * Shared table shell so every Documents tab matches the Other documents layout.
 * Renders a `space-y-2 lg:hidden` mobile card stack (via `mobile`) above the
 * `lg:` desktop table so neither layout scrolls horizontally on small screens.
 */
function DocumentsTableShell({
  head,
  children,
  mobile,
}: {
  head: ReactNode;
  children: ReactNode;
  mobile: ReactNode;
}) {
  return (
    <>
      <div className="space-y-2 lg:hidden">{mobile}</div>
      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
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

/** Human room label for an application row, resolved from the listing catalog. */
function applicationRoomLabel(row: DemoApplicantRow): string {
  const roomChoice = row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "";
  return getRoomChoiceLabel(roomChoice);
}

/** Server PDF endpoint for an application (residents may fetch their own). */
function applicationPdfHref(row: DemoApplicantRow): string {
  const roomLabel = applicationRoomLabel(row);
  const params = new URLSearchParams();
  if (roomLabel) params.set("roomLabel", roomLabel);
  const query = params.toString();
  return `/api/manager-applications/${encodeURIComponent(row.id)}/pdf${query ? `?${query}` : ""}`;
}

/** Documents › Application — the resident's applications as table rows with an inline document view below. */
function ApplicationDocumentsTable() {
  const session = usePortalSession();
  const email = session.email?.trim().toLowerCase() ?? "";
  const [tick, setTick] = useState(0);
  const [preview, setPreview] = useState<DemoApplicantRow | null>(null);
  const [previewCosignerSubmissions, setPreviewCosignerSubmissions] = useState<CosignerSubmission[]>([]);
  // Demo sandbox: the PDF route requires auth, so build the same PDF in the
  // browser and feed it to the download as a data URL.
  const demoMode = isDemoModeActive();
  const demoPdfCache = useRef(new Map<string, string>());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset co-signer data when the previewed application changes
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

  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    void syncManagerApplicationsFromServer().then(on);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, on);
    return () => window.removeEventListener(MANAGER_APPLICATIONS_EVENT, on);
  }, []);

  const rows = useMemo<DemoApplicantRow[]>(() => {
    void tick;
    if (!email) return [];
    return readManagerApplicationRows().filter((row) => (row.email ?? "").trim().toLowerCase() === email);
  }, [email, tick]);

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
      triggerDocumentDownload(applicationPdfHref(row));
    },
    [demoMode, buildDemoPdf],
  );

  // Rendered-document HTML (same as the manager Applications preview) — the
  // application data is already client-side, so this works in demo mode too.
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

  if (rows.length === 0) {
    return <PortalDataTableEmpty icon="application" message="No applications are linked to your account yet." />;
  }

  return (
    <>
      <DocumentsTableShell
        head={
          <>
            <th className={`${MANAGER_TABLE_TH} text-left`}>Name</th>
            <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
            <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
          </>
        }
        mobile={rows.map((row) => (
          <PortalMobileSummaryCard
            key={row.id}
            title={`Rental application — ${row.id}`}
            subtitle={applicationStatusLabel(row.bucket)}
            meta={row.property || "—"}
            onClick={() => setPreview(row)}
          />
        ))}
      >
        {rows.map((row) => (
          <tr key={row.id} className={PORTAL_TABLE_TR_EXPANDABLE} onClick={() => setPreview(row)}>
            <td className={`${PORTAL_TABLE_TD} align-middle`}>
              <p className="min-w-0 max-w-[320px] truncate font-medium text-foreground">
                Rental application — {row.id}
              </p>
            </td>
            <td className={`${PORTAL_TABLE_TD} align-middle`}>{applicationStatusLabel(row.bucket)}</td>
            <td className={`${PORTAL_TABLE_TD} align-middle`}>
              <p className="min-w-0 max-w-[280px] truncate">{row.property || "—"}</p>
            </td>
          </tr>
        ))}
      </DocumentsTableShell>
      {preview ? (
        <DocumentInlineViewer
          title={`Rental application — ${preview.id}`}
          srcDoc={previewHtml}
          onClose={() => setPreview(null)}
          onDownload={() => downloadRow(preview)}
        />
      ) : null}
    </>
  );
}

type ReceiptRow = { date: string; description: string; amount: string };

/** Ledger-statement PDF scoped to a single day — serves as the receipt for that payment. */
function receiptPdfHref(date: string): string {
  const params = new URLSearchParams({ from: date, to: date, format: "pdf" });
  return `/api/reports/resident-ledger/export?${params.toString()}`;
}

/** Documents › Rent receipts — one row per recorded payment, with an inline receipt document below. */
function RentReceiptsTab() {
  const session = usePortalSession();
  const [ledgerReport, setLedgerReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [generated, setGenerated] = useState(false);
  const [range, setRange] = useState(defaultReceiptRange);
  const [preview, setPreview] = useState<ReceiptRow | null>(null);
  // Demo sandbox: no authenticated ledger API — derive receipt rows from the
  // seeded local charges and build receipt PDFs in the browser.
  const demoMode = isDemoModeActive();
  const demoPdfCache = useRef(new Map<string, string>());
  const sessionEmail = session.email?.trim().toLowerCase() ?? "";
  const sessionUserId = session.userId ?? null;

  const loadReceipts = useCallback(async (from: string, to: string) => {
    if (demoMode) {
      const rows = readChargesForResident(sessionEmail, sessionUserId)
        .filter((charge) => charge.status === "paid" && charge.paidAt)
        .sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)))
        .map((charge) => ({
          date: String(charge.paidAt).slice(0, 10),
          description: `${charge.title} — ${charge.propertyLabel}`,
          payment: charge.amountLabel,
        }));
      setLedgerReport({ id: "resident-ledger", title: "Resident ledger", columns: [], rows });
      setGenerated(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to, backfill: "1" });
      const res = await fetch(`/api/reports/resident-ledger?${params}`);
      const data = await res.json();
      if (res.ok) {
        setLedgerReport(data as ReportResult);
        setGenerated(true);
      }
    } finally {
      setLoading(false);
    }
  }, [demoMode, sessionEmail, sessionUserId]);

  useEffect(() => {
    const { from, to } = defaultReceiptRange();
    queueMicrotask(() => void loadReceipts(from, to));
  }, [loadReceipts]);

  const receipts = useMemo<ReceiptRow[]>(() => {
    if (!ledgerReport) return [];
    return ledgerReport.rows
      .filter((row) => typeof row.payment === "string" && row.payment.trim() !== "")
      .map((row) => ({
        date: String(row.date ?? ""),
        description: String(row.description ?? "").trim() || "Rent payment",
        amount: String(row.payment),
      }))
      .reverse();
  }, [ledgerReport]);

  const ledgerQuery = new URLSearchParams({ from: range.from, to: range.to }).toString();

  const buildDemoReceipt = useCallback(async (row: ReceiptRow): Promise<string> => {
    const key = `${row.date}:${row.amount}`;
    const cached = demoPdfCache.current.get(key);
    if (cached) return cached;
    const { buildDemoReceiptPdfDataUrl } = await import("@/lib/demo/demo-document-files");
    const url = await buildDemoReceiptPdfDataUrl({
      residentName: DEMO_RESIDENT_NAME,
      description: row.description,
      amountLabel: row.amount,
      dateLabel: row.date,
    });
    demoPdfCache.current.set(key, url);
    return url;
  }, []);

  const downloadReceipt = useCallback(
    (row: ReceiptRow) => {
      if (demoMode) {
        void buildDemoReceipt(row).then((url) => triggerDocumentDownload(url, `rent-receipt-${row.date}.pdf`));
        return;
      }
      triggerDocumentDownload(receiptPdfHref(row.date));
    },
    [demoMode, buildDemoReceipt],
  );

  // Rendered receipt document (white serif page, like the lease/application) —
  // everything the receipt shows is already in the row, so no extra fetch.
  const previewHtml = useMemo(
    () =>
      preview
        ? buildRentReceiptHtml({
            residentName: demoMode ? DEMO_RESIDENT_NAME : sessionEmail || undefined,
            description: preview.description,
            amountLabel: preview.amount,
            dateLabel: preview.date,
          })
        : null,
    [preview, demoMode, sessionEmail],
  );

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              From
              <input
                type="date"
                className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
                value={range.from}
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              To
              <input
                type="date"
                className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
                value={range.to}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              />
            </label>
            <button
              type="button"
              className="mt-5 h-10 rounded-full border border-border bg-foreground px-4 text-xs font-medium text-background hover:opacity-90"
              data-attr="resident-receipts-update-range"
              onClick={() => void loadReceipts(range.from, range.to)}
              disabled={loading}
            >
              {loading ? "Loading…" : "Update"}
            </button>
          </div>
          {generated && receipts.length > 0 && !demoMode ? (
            <ReportExportButtons reportId="resident-ledger" query={ledgerQuery} />
          ) : null}
        </div>
        {loading && !generated ? (
          <ReportGeneratePrompt loading loadingTitle="Loading rent receipts…" />
        ) : receipts.length === 0 ? (
          <PortalDataTableEmpty icon="default" message="No rent receipts in this date range yet." />
        ) : (
          <DocumentsTableShell
            head={
              <>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Name</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Amount</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Date</th>
              </>
            }
            mobile={receipts.map((row, i) => (
              <PortalMobileSummaryCard
                key={`${row.date}-${i}`}
                title={`Rent receipt — ${row.description}`}
                subtitle={row.amount}
                meta={row.date}
                onClick={() => setPreview(row)}
              />
            ))}
          >
            {receipts.map((row, i) => (
              <tr
                key={`${row.date}-${i}`}
                className={PORTAL_TABLE_TR_EXPANDABLE}
                onClick={() => setPreview(row)}
              >
                <td className={`${PORTAL_TABLE_TD} align-middle`}>
                  <p className="min-w-0 max-w-[320px] truncate font-medium text-foreground">
                    Rent receipt — {row.description}
                  </p>
                </td>
                <td className={`${PORTAL_TABLE_TD} align-middle`}>{row.amount}</td>
                <td className={`${PORTAL_TABLE_TD} align-middle`}>{row.date}</td>
              </tr>
            ))}
          </DocumentsTableShell>
        )}
        {preview ? (
          <DocumentInlineViewer
            title={`Rent receipt — ${preview.date}`}
            srcDoc={previewHtml}
            onClose={() => setPreview(null)}
            onDownload={() => downloadReceipt(preview)}
          />
        ) : null}
      </div>
    </>
  );
}

/**
 * Documents › Lease — read-only: the fully signed lease as a downloadable
 * document. Signing, feedback, and uploads live in the standalone Lease tab;
 * none of that is offered here.
 */
function SignedLeaseDocumentsTable() {
  const { showToast } = useAppUi();
  const session = usePortalSession();
  const email = session.email?.trim() ?? "";
  const [tick, setTick] = useState(0);
  const [residentAxisId, setResidentAxisId] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!session.userId) return;
    // Demo sandbox: never resolve an axis id from the real Supabase browser
    // session — a visitor signed in to a real account would resolve THEIR id,
    // which mismatches the seeded demo lease and hides it after first paint.
    if (isDemoModeActive()) return;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const [{ data: profile }, { data: authUser }] = await Promise.all([
          supabase.from("profiles").select("manager_id").eq("id", session.userId).maybeSingle(),
          supabase.auth.getUser(),
        ]);
        if (cancelled) return;
        const meta = authUser?.user?.user_metadata as Record<string, unknown> | undefined;
        const metaAxis = typeof meta?.axis_id === "string" ? meta.axis_id : null;
        setResidentAxisId(
          resolveResidentPortalAxisId({
            profileManagerId: profile?.manager_id,
            authUserAxisId: metaAxis,
          }),
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.userId]);

  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    void syncLeasePipelineFromServer().then(on);
    window.addEventListener(LEASE_PIPELINE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(LEASE_PIPELINE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const row = useMemo<LeasePipelineRow | null>(() => {
    void tick;
    if (!email) return null;
    return findLeaseForResidentEmail(email, {
      email,
      residentAxisId,
      profileManagerId: residentAxisId,
    });
  }, [email, tick, residentAxisId]);

  const fullySigned = Boolean(row && hasBothLeaseSignatures(row));

  if (!row || !fullySigned) {
    return <PortalDataTableEmpty icon="lease" message="Your signed lease will appear here once it's signed." />;
  }

  const pdfSrc = row.managerUploadedPdf?.dataUrl ?? null;
  const leaseHtml = pdfSrc ? null : getLeaseDocumentHtml(row);
  const signedAt = row.fullySignedAt ?? row.updatedAtIso;
  const leaseName = `Signed lease${row.unit ? ` — ${row.unit}` : ""}`;

  const onDownload = () => {
    downloadLeaseFromRow(row);
    showToast(
      pdfSrc ? "PDF download started." : "Print dialog opened — choose 'Save as PDF' to download.",
    );
  };

  return (
    <>
      <DocumentsTableShell
        head={
          <>
            <th className={`${MANAGER_TABLE_TH} text-left`}>Name</th>
            <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
            <th className={`${MANAGER_TABLE_TH} text-left`}>Date signed</th>
          </>
        }
        mobile={
          <PortalMobileSummaryCard
            title={leaseName}
            subtitle="Fully signed"
            meta={safeFormatDateTime(signedAt)}
            onClick={() => setPreviewOpen(true)}
          />
        }
      >
        <tr className={PORTAL_TABLE_TR_EXPANDABLE} onClick={() => setPreviewOpen(true)}>
          <td className={`${PORTAL_TABLE_TD} align-middle`}>
            <p className="min-w-0 max-w-[320px] truncate font-medium text-foreground">{leaseName}</p>
          </td>
          <td className={`${PORTAL_TABLE_TD} align-middle`}>Fully signed</td>
          <td className={`${PORTAL_TABLE_TD} align-middle`}>{safeFormatDateTime(signedAt)}</td>
        </tr>
      </DocumentsTableShell>
      {previewOpen ? (
        <DocumentInlineViewer
          title={leaseName}
          src={pdfSrc}
          srcDoc={leaseHtml}
          onClose={() => setPreviewOpen(false)}
          onDownload={onDownload}
        />
      ) : null}
    </>
  );
}

export function ResidentDocumentsPanel({
  tabId,
  basePath = "/resident",
  tabs,
}: {
  tabId: string;
  basePath?: string;
  tabs: ReadonlyArray<{ id: string; label: string }>;
}) {
  const { showToast } = useAppUi();
  const session = usePortalSession();
  const navigate = usePortalNavigate();
  const email = session.email?.trim().toLowerCase() ?? "";

  const [addMode, setAddMode] = useState<AddDocumentMode | null>(null);
  const [uploads, setUploads] = useState<UploadedOwnLease[]>([]);
  const [uploadsLoading, setUploadsLoading] = useState(true);

  const refreshUploads = useCallback(async () => {
    if (!email) {
      setUploads([]);
      setUploadsLoading(false);
      return;
    }
    setUploadsLoading(true);
    try {
      const rows = await syncUploadedOwnLeasesFromServer(email);
      setUploads(rows);
    } finally {
      setUploadsLoading(false);
    }
  }, [email]);

  useEffect(() => {
    queueMicrotask(() => void refreshUploads());
  }, [refreshUploads]);

  const tabItems = useMemo(
    () => tabs.map((tab) => ({ id: tab.id, label: tab.label, href: `${basePath}/documents/${tab.id}` })),
    [tabs, basePath],
  );

  const openAddModal = (mode: AddDocumentMode) => {
    if (!email) {
      showToast("Sign in to upload documents.");
      return;
    }
    setAddMode(mode);
  };

  const onDocumentAdded = () => {
    setUploads(readUploadedOwnLeases(email));
    if (tabId !== "other") navigate(`${basePath}/documents/other`);
  };

  const onRemoveUpload = (id: string) => {
    if (!email) return;
    removeUploadedOwnLease(email, id);
    setUploads(readUploadedOwnLeases(email));
    showToast("Removed.");
  };

  return (
    <ManagerPortalPageShell
      title="Documents"
      titleAside={
        <>
          <Button
            type="button"
            variant="outline"
            className={PORTAL_HEADER_ACTION_BTN}
            data-attr="resident-documents-add-photo"
            onClick={() => openAddModal("photo")}
          >
            Add photo
          </Button>
          <Button
            type="button"
            className={PORTAL_HEADER_ACTION_BTN}
            data-attr="resident-documents-add-document"
            onClick={() => openAddModal("document")}
          >
            Add document
          </Button>
        </>
      }
      filterRow={
        <ManagerPortalFilterRow>
          <TabNav items={tabItems} activeId={tabId} />
        </ManagerPortalFilterRow>
      }
    >
      {tabId === "application" ? <ApplicationDocumentsTable /> : null}

      {tabId === "lease" ? <SignedLeaseDocumentsTable /> : null}

      {tabId === "receipts" ? <RentReceiptsTab /> : null}

      {tabId === "other" ? (
        <ResidentOtherDocumentsTable uploads={uploads} loading={uploadsLoading} onRemove={onRemoveUpload} />
      ) : null}

      <ResidentAddDocumentModal
        key={addMode ?? "closed"}
        mode={addMode}
        email={email}
        onClose={() => setAddMode(null)}
        onAdded={onDocumentAdded}
      />
    </ManagerPortalPageShell>
  );
}
