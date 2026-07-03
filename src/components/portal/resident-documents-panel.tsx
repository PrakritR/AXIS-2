"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  PORTAL_HEADER_ACTION_BTN,
  PORTAL_SECTION_SURFACE,
} from "@/components/portal/portal-metrics";
import { TabNav } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ReportExportButtons } from "@/components/portal/reports/report-filter-bar";
import { FinancialReportDocumentView } from "@/components/portal/reports/formal-document-preview";
import { ReportGeneratePrompt } from "@/components/portal/reports/report-generate-prompt";
import { ReportTable } from "@/components/portal/reports/report-table";
import { PortalDataTableEmpty } from "@/components/portal/portal-data-table";
import {
  ResidentAddDocumentModal,
  ResidentOtherDocumentsTable,
  type AddDocumentMode,
} from "@/components/portal/resident-other-documents";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { usePortalSession } from "@/hooks/use-portal-session";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import {
  MANAGER_APPLICATIONS_EVENT,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import type { DemoApplicantRow, ManagerApplicationBucket } from "@/data/demo-portal";
import {
  readUploadedOwnLeases,
  removeUploadedOwnLease,
  syncUploadedOwnLeasesFromServer,
  type UploadedOwnLease,
} from "@/lib/resident-lease-upload";
import type { ReportResult } from "@/lib/reports/types";

function defaultReceiptRange() {
  const now = new Date();
  const from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

/** Simple downloadable-document row used by the Application tab. */
function DocumentEntryRow({
  name,
  meta,
  actions,
}: {
  name: string;
  meta: string;
  actions: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--glass-fill)] ring-1 ring-border" aria-hidden>
          <svg className="h-5 w-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          <p className="mt-0.5 truncate text-xs text-muted">{meta}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
    </li>
  );
}

function applicationStatusLabel(bucket: ManagerApplicationBucket): string {
  if (bucket === "approved") return "Approved";
  if (bucket === "rejected") return "Rejected";
  return "Pending review";
}

/** Documents › Application — the resident's applications as simple entries. */
function ApplicationDocumentEntries({ basePath }: { basePath: string }) {
  const session = usePortalSession();
  const email = session.email?.trim().toLowerCase() ?? "";
  const [tick, setTick] = useState(0);

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

  if (rows.length === 0) {
    return <PortalDataTableEmpty icon="application" message="No applications are linked to your account yet." />;
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <DocumentEntryRow
          key={row.id}
          name={`Rental application — ${row.property || row.id}`}
          meta={`${applicationStatusLabel(row.bucket)} · ${row.id}`}
          actions={
            <Link
              href={`${basePath}/applications?open=${encodeURIComponent(row.id)}`}
              className="inline-flex min-h-9 items-center rounded-full border border-border bg-card px-4 text-xs font-semibold text-foreground transition hover:bg-accent/60"
            >
              View application
            </Link>
          }
        />
      ))}
    </ul>
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

  const [ledgerReport, setLedgerReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [range, setRange] = useState(defaultReceiptRange);

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

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to, backfill: "1" });
      const res = await fetch(`/api/reports/resident-ledger?${params}`);
      const data = await res.json();
      if (res.ok) {
        setLedgerReport(data as ReportResult);
        setGenerated(true);
      }
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    queueMicrotask(() => {
      setLedgerReport(null);
      setGenerated(false);
    });
  }, [tabId]);

  const ledgerQuery = new URLSearchParams({ from: range.from, to: range.to }).toString();

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
      {tabId === "application" ? <ApplicationDocumentEntries basePath={basePath} /> : null}

      {tabId === "receipts" ? (
        <div className={`${PORTAL_SECTION_SURFACE} space-y-4 p-4 sm:p-5`}>
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
                onClick={() => void loadReceipts()}
                disabled={loading}
              >
                {loading ? "Generating…" : "Generate receipts"}
              </button>
            </div>
            {generated ? <ReportExportButtons reportId="resident-ledger" query={ledgerQuery} /> : null}
          </div>
          {loading ? (
            <ReportGeneratePrompt loading loadingTitle="Generating receipts…" />
          ) : !generated ? (
            <ReportGeneratePrompt title="No rent receipts yet." />
          ) : ledgerReport ? (
            <FinancialReportDocumentView report={ledgerReport} />
          ) : (
            <ReportTable report={ledgerReport} loading={loading} generated={generated} />
          )}
        </div>
      ) : null}

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
