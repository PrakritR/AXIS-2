"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PortalNotificationPreviewModal } from "@/components/portal/portal-notification-preview-modal";
import { ShareLeadLinkModal } from "@/components/portal/share-lead-link-modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  MANAGER_TABLE_TH,
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
  PORTAL_FILTER_ACTIONS_MOBILE,
  PORTAL_HEADER_ACTION_BTN,
  PORTAL_PAGE_ACTIONS_DESKTOP,
} from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PORTAL_DETAIL_BTN_PRIMARY,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PortalTableDetailActions,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { stripPropertyRoomCountSuffix } from "@/lib/portal-mobile-preview";
import { ApplicationScreeningPanel } from "@/components/portal/application-screening-panel";
import { CheckrScreeningModal } from "@/components/portal/checkr-screening-modal";
import { ManagerScreeningSettingsButton, ManagerScreeningSettingsModal } from "@/components/portal/manager-screening-settings";
import type { DemoApplicantRow, ManagerApplicationBucket } from "@/data/demo-portal";
import {
  MANAGER_APPLICATIONS_EVENT,
  deleteManagerApplicationFromServer,
  normalizeApplicationAxisId,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
  writeManagerApplicationRows,
} from "@/lib/manager-applications-storage";
import {
  MANAGER_PORTFOLIO_REFRESH_EVENTS,
  applicationVisibleToPortalUser,
  buildManagerPropertyFilterOptions,
} from "@/lib/manager-portfolio-access";
import { buildManagerShareablePropertyOptions } from "@/lib/manager-property-links";
import { syncPropertyPipelineFromServer, hasCachedPropertyPipeline } from "@/lib/demo-property-pipeline";
import { buildApplicationHtml } from "@/lib/manager-application-html";
import {
  fetchCosignerSubmissionsForSignerAppId,
  type CosignerSubmission,
} from "@/lib/cosigner-submissions-storage";
import { getRoomChoiceLabel } from "@/lib/rental-application/data";
import {
  recordApprovedApplicationCharges,
  recordSubmittedApplicationFeeCharge,
  removeAllApplicationCharges,
  removeApprovedApplicationCharges,
  removeResidentHouseholdPaymentData,
  syncHouseholdChargesFromServer,
} from "@/lib/household-charges";
import {
  deleteLeasePipelineRowsForResident,
} from "@/lib/lease-pipeline-storage";
import {
  deleteManagerWorkOrdersForResident,
} from "@/lib/manager-work-orders-storage";
import { deleteServiceRequestsForResident } from "@/lib/service-requests-storage";
import { loadPersistedInbox, MANAGER_INBOX_STORAGE_KEY, persistInbox } from "@/lib/portal-inbox-storage";
import {
  RESIDENT_WELCOME_EMAIL_SUBJECT,
  buildResidentWelcomeEmailBody,
  residentAccountCreationUrl,
} from "@/lib/resident-welcome-email";
function countByBucket(rows: DemoApplicantRow[]) {
  const c = { pending: 0, approved: 0, rejected: 0 };
  for (const r of rows) {
    c[r.bucket] += 1;
  }
  return c;
}

async function syncResidentApproval(row: DemoApplicantRow, nextBucket: ManagerApplicationBucket) {
  const email = row.email?.trim().toLowerCase();
  if (!email) return;
  await fetch("/api/portal/resident-approval", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      email,
      approved: nextBucket === "approved",
    }),
  });
}

/** POST welcome email; does not open mailto (used for auto-send on approve). */
async function requestResidentWelcomeEmail(row: DemoApplicantRow): Promise<{
  status: "sent" | "failed" | "no_email";
  mailtoHref?: string;
  error?: string;
}> {
  const email = row.email?.trim();
  if (!email) return { status: "no_email" };
  const res = await fetch("/api/portal/send-resident-welcome", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ to: email, residentName: row.name, axisId: row.id }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string; mailtoHref?: string };
  if (res.ok && data.ok) return { status: "sent" };
  return { status: "failed", mailtoHref: typeof data.mailtoHref === "string" ? data.mailtoHref : undefined, error: data.error };
}

function stageLabelForRow(row: DemoApplicantRow, bucket: ManagerApplicationBucket) {
  if (bucket === "approved") return "Approved";
  if (bucket === "rejected") return "Rejected";
  return "Submitted";
}

/** Client-resolved room label used by both the PDF download and the inline document view. */
function applicationRoomLabel(row: DemoApplicantRow): string {
  const roomChoice = row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "";
  return getRoomChoiceLabel(roomChoice);
}

/** Server PDF endpoint for an application, with the client-resolved room label as a display hint. */
function applicationPdfHref(row: DemoApplicantRow): string {
  const params = new URLSearchParams();
  const roomLabel = applicationRoomLabel(row);
  if (roomLabel) params.set("roomLabel", roomLabel);
  const query = params.toString();
  return `/api/manager-applications/${encodeURIComponent(row.id)}/pdf${query ? `?${query}` : ""}`;
}

/** Trigger a browser download of the application PDF without opening a blank tab. */
export function downloadApplicationPdf(row: DemoApplicantRow): void {
  const anchor = document.createElement("a");
  anchor.href = applicationPdfHref(row);
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Inline rendered-document view of the application, matching the lease-document presentation:
 * clean styled HTML in an srcDoc iframe (no browser PDF-viewer chrome). The document page is
 * always white like the lease, so it reads clearly on the themed card frame in both light and
 * dark mode; the Download PDF action in the detail toolbar produces the official PDF file.
 * Rendered for every bucket (pending/approved/rejected) and also for rows without a stored
 * application payload (e.g. manually added applicants), mirroring buildApplicationPdf which
 * falls back to row-level fields.
 */
export function ApplicationDocumentPreview({ row }: { row: DemoApplicantRow }) {
  const [cosignerSubmissions, setCosignerSubmissions] = useState<CosignerSubmission[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset co-signer data when the row changes
    setCosignerSubmissions([]);
    if (row.application?.hasCosigner !== "yes") return;
    let cancelled = false;
    void fetchCosignerSubmissionsForSignerAppId(row.id).then((rows) => {
      if (!cancelled) setCosignerSubmissions(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [row.id, row.application?.hasCosigner]);

  const documentHtml = useMemo(
    () => buildApplicationHtml(row, { roomLabel: applicationRoomLabel(row) || undefined, cosignerSubmissions }),
    [row, cosignerSubmissions],
  );
  return (
    <section>
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">Application</p>
      <div className="mt-3 overflow-hidden rounded-2xl border border-border shadow-sm">
        <iframe
          srcDoc={documentHtml}
          title="Application document preview"
          sandbox="allow-same-origin"
          loading="lazy"
          className="h-[720px] w-full border-0 bg-white"
        />
      </div>
    </section>
  );
}

function roomSortKey(row: DemoApplicantRow): string {
  return (
    getRoomChoiceLabel(row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "") ||
    row.stage ||
    ""
  ).trim();
}

function displayRoomForRow(row: DemoApplicantRow): string {
  const raw = row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "";
  if (!raw) return "—";
  // Return just the room name (first segment before " · ")
  const full = getRoomChoiceLabel(raw);
  return full.split(" · ")[0]?.trim() || full || "—";
}

function sortApplicationRows(rows: DemoApplicantRow[], bucket: ManagerApplicationBucket): DemoApplicantRow[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return [...rows].sort((a, b) => {
    if (bucket === "approved") {
      const propertyCmp = collator.compare(a.property || "", b.property || "");
      if (propertyCmp !== 0) return propertyCmp;
      const roomCmp = collator.compare(roomSortKey(a), roomSortKey(b));
      if (roomCmp !== 0) return roomCmp;
    }
    const applicantCmp = collator.compare(a.name || "", b.name || "");
    if (applicantCmp !== 0) return applicantCmp;
    return collator.compare(a.id, b.id);
  });
}

export function ManagerApplications() {
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const pathname = usePathname();
  const router = useRouter();
  const openHandled = useRef(false);
  const [bucket, setBucket] = useState<ManagerApplicationBucket>("pending");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rows, setRows] = useState<DemoApplicantRow[]>(() =>
    typeof window === "undefined" ? [] : readManagerApplicationRows(),
  );
  const [portfolioTick, setPortfolioTick] = useState(() =>
    typeof window === "undefined" ? 0 : hasCachedPropertyPipeline() ? 1 : 0,
  );
  const [approvePreviewRow, setApprovePreviewRow] = useState<DemoApplicantRow | null>(null);
  const [approveBusyId, setApproveBusyId] = useState<string | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [screeningModalOpen, setScreeningModalOpen] = useState(false);
  const [checkrScreeningRowId, setCheckrScreeningRowId] = useState<string | null>(null);
  useEffect(() => {
    if (!authReady) return;
    const sync = () => setRows(readManagerApplicationRows());
    sync();
    void syncManagerApplicationsFromServer({ managerUserId: userId }).then(sync);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, sync);
    return () => {
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, sync);
    };
  }, [authReady, userId]);

  useEffect(() => {
    if (!authReady || !userId) return;
    let cancelled = false;
    void syncPropertyPipelineFromServer()
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        setPortfolioTick((n) => (n > 0 ? n : 1));
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, userId]);

  useEffect(() => {
    const bump = () => setPortfolioTick((n) => n + 1);
    for (const ev of MANAGER_PORTFOLIO_REFRESH_EVENTS) {
      window.addEventListener(ev, bump);
    }
    return () => {
      for (const ev of MANAGER_PORTFOLIO_REFRESH_EVENTS) {
        window.removeEventListener(ev, bump);
      }
    };
  }, []);

  const persist = useCallback((next: DemoApplicantRow[]) => {
    setRows(next);
    writeManagerApplicationRows(next);
  }, []);

  const handleScreeningUpdated = useCallback(() => {
    void syncManagerApplicationsFromServer({ managerUserId: userId }).then(setRows);
  }, [userId]);

  const propertyOptions = buildManagerPropertyFilterOptions(userId);
  const shareableProperties = useMemo(() => buildManagerShareablePropertyOptions(userId), [userId, portfolioTick]);

  const scopedRows = useMemo(() => {
    if (!userId) return [];
    return rows.filter((r) => applicationVisibleToPortalUser(r, userId));
  }, [rows, userId]);

  const counts = useMemo(() => countByBucket(scopedRows), [scopedRows]);
  const tabs = useMemo(
    () =>
      [
        { id: "pending" as const, label: "Pending", count: counts.pending },
        { id: "approved" as const, label: "Approved", count: counts.approved },
        { id: "rejected" as const, label: "Rejected", count: counts.rejected },
      ] as const,
    [counts],
  );

  const rowsForBucket = useMemo(() => {
    const inBucket = scopedRows.filter((r) => r.bucket === bucket);
    const filtered = !propertyFilter.trim()
      ? inBucket
      : inBucket.filter((r) => (r.assignedPropertyId?.trim() || r.propertyId?.trim() || r.application?.propertyId?.trim()) === propertyFilter);
    return sortApplicationRows(filtered, bucket);
  }, [scopedRows, bucket, propertyFilter]);

  useEffect(() => {
    if (openHandled.current || scopedRows.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const raw = (params.get("open") ?? params.get("axisId") ?? "").trim();
    if (!raw) return;
    const id = normalizeApplicationAxisId(raw).toUpperCase();
    const hit = scopedRows.find((r) => normalizeApplicationAxisId(r.id).toUpperCase() === id);
    if (!hit) return;
    openHandled.current = true;
    queueMicrotask(() => {
      setBucket(hit.bucket);
      setExpandedId(hit.id);
    });
    requestAnimationFrame(() => {
      document.getElementById(`portal-application-${hit.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    params.delete("open");
    params.delete("axisId");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [scopedRows, pathname, router]);

  const setRowBucket = async (id: string, nextBucket: ManagerApplicationBucket, opts?: { skipWelcomeEmail?: boolean }) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const next = rows.map((r) =>
      r.id === id
        ? {
            ...r,
            bucket: nextBucket,
            stage: stageLabelForRow(r, nextBucket),
            managerUserId: r.managerUserId ?? (nextBucket === "approved" ? (userId ?? undefined) : r.managerUserId),
          }
        : r,
    );
    persist(next);
    const updatedRow = next.find((r) => r.id === id) ?? row;
    try {
      if (nextBucket === "approved") {
        recordApprovedApplicationCharges(updatedRow, userId ?? null);
      } else if (nextBucket === "pending") {
        removeApprovedApplicationCharges(id, userId ?? null);
        recordSubmittedApplicationFeeCharge(updatedRow, userId ?? null);
      } else {
        removeAllApplicationCharges(id, userId ?? null);
      }
    } catch {
      /* Keep approval flow moving even if charge reconciliation fails. */
    }
    if (row) {
      try {
        await syncResidentApproval(row, nextBucket);
      } catch {
        /* keep local workflow moving even if profile sync fails */
      }
    }

    let welcomeSent = false;
    if (nextBucket === "approved" && updatedRow.email?.trim() && !opts?.skipWelcomeEmail) {
      const welcome = await requestResidentWelcomeEmail(updatedRow);
      welcomeSent = welcome.status === "sent";
    }

    setExpandedId(null);
    setBucket(nextBucket);
    const msg =
      nextBucket === "approved"
        ? opts?.skipWelcomeEmail
          ? "Application approved (no setup email sent)."
          : welcomeSent
            ? "Application approved. A welcome email with portal setup was sent to the applicant."
            : "Application approved."
        : nextBucket === "rejected"
          ? "Application rejected."
          : "Moved to Pending.";
    showToast(msg);
  };

  const deleteApplication = async (id: string) => {
    const row = rows.find((candidate) => candidate.id === id);
    const email = row?.email?.trim().toLowerCase();

    // Optimistic removal — update the UI immediately before any network calls.
    setRows((prev) => prev.filter((r) => r.id !== id));
    setExpandedId(null);

    const result = await deleteManagerApplicationFromServer(id);
    if (!result.ok) {
      // Roll back on failure.
      setRows(await syncManagerApplicationsFromServer({ managerUserId: userId }));
      showToast(result.error ?? "Could not delete application.");
      return;
    }

    await syncHouseholdChargesFromServer();
    removeAllApplicationCharges(id, userId ?? null);

    let removedResidentAccess = true;
    if (email) {
      try {
        const res = await fetch("/api/portal/delete-resident-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, purgeData: true, applicationId: id }),
        });
        if (!res.ok) removedResidentAccess = false;
      } catch {
        removedResidentAccess = false;
      }
      if (removedResidentAccess) {
        removeResidentHouseholdPaymentData(email);
        deleteLeasePipelineRowsForResident(email, id, userId);
        deleteManagerWorkOrdersForResident(email);
        deleteServiceRequestsForResident(email);
        const allInbox = loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []);
        const deletedThreads = allInbox.filter((thread) => thread.email.trim().toLowerCase() === email);
        persistInbox(
          MANAGER_INBOX_STORAGE_KEY,
          allInbox.filter((thread) => thread.email.trim().toLowerCase() !== email),
        );
        for (const thread of deletedThreads) {
          void fetch("/api/portal-inbox-threads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ action: "delete", id: thread.id }),
          }).catch(() => undefined);
        }
      }
    }

    void syncManagerApplicationsFromServer({ managerUserId: userId }).then(setRows);
    showToast(
      email && !removedResidentAccess
        ? "Application deleted, but resident access could not be removed."
        : email
          ? "Application and resident access deleted."
          : "Application deleted.",
    );
  };

  const renderApplicationDetail = (row: DemoApplicantRow) => (
    <div className="mx-auto max-w-5xl space-y-8">
      <PortalTableDetailActions placement="top">
        {row.bucket === "pending" ? (
          <>
            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN_PRIMARY} onClick={() => setApprovePreviewRow(row)}>
              Approve
            </Button>
            <Button
              type="button"
              variant="outline"
              className={PORTAL_DETAIL_BTN}
              data-attr="open-run-screening"
              onClick={() => setCheckrScreeningRowId(row.id)}
            >
              Run screening
            </Button>
            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => setRowBucket(row.id, "rejected")}>
              Reject
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => setRowBucket(row.id, "pending")}>
            Move to pending
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className={PORTAL_DETAIL_BTN}
          data-attr="application-pdf-download"
          onClick={() => downloadApplicationPdf(row)}
        >
          Download PDF
        </Button>
        <Button
          type="button"
          variant="outline"
          className={`${PORTAL_DETAIL_BTN} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)] portal-danger-outline`}
          onClick={() => void deleteApplication(row.id)}
        >
          Delete application
        </Button>
      </PortalTableDetailActions>

      <ApplicationDocumentPreview row={row} />

      <ApplicationScreeningPanel
        row={row}
        onUpdated={handleScreeningUpdated}
        onOpenScreeningModal={() => setCheckrScreeningRowId(row.id)}
      />
    </div>
  );

  return (
    <>
    <ManagerPortalPageShell
      title="Applications"
      titleAside={
        <>
          <div className={PORTAL_PAGE_ACTIONS_DESKTOP}>
            <PortalPropertyFilterPill
              propertyOptions={propertyOptions}
              propertyValue={propertyFilter}
              onPropertyChange={(id) => setPropertyFilter(id)}
            />
            <ManagerScreeningSettingsButton onClick={() => setScreeningModalOpen(true)} />
          </div>
          <Button
            type="button"
            variant="outline"
            className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
            onClick={() => setInviteModalOpen(true)}
            disabled={shareableProperties.length === 0}
            title={shareableProperties.length === 0 ? "List a property as active before inviting prospects" : undefined}
          >
            Invite to apply
          </Button>
        </>
      }
      filterRow={
        <ManagerPortalFilterRow>
          <ManagerPortalStatusPills tabs={[...tabs]} activeId={bucket} onChange={(id) => setBucket(id as ManagerApplicationBucket)} />
          <div className={`${PORTAL_FILTER_ACTIONS_MOBILE} items-center`}>
            <PortalPropertyFilterPill
              propertyOptions={propertyOptions}
              propertyValue={propertyFilter}
              onPropertyChange={(id) => setPropertyFilter(id)}
            />
            <ManagerScreeningSettingsButton onClick={() => setScreeningModalOpen(true)} />
          </div>
        </ManagerPortalFilterRow>
      }
    >
      <ManagerScreeningSettingsModal open={screeningModalOpen} onClose={() => setScreeningModalOpen(false)} />
      <CheckrScreeningModal
        key={checkrScreeningRowId ?? "none"}
        row={rows.find((r) => r.id === checkrScreeningRowId) ?? null}
        open={checkrScreeningRowId !== null}
        onClose={() => setCheckrScreeningRowId(null)}
        onUpdated={handleScreeningUpdated}
      />
      {!authReady && rows.length === 0 ? (
        <div className={PORTAL_DATA_TABLE_WRAP}>
          <div className="flex items-center justify-center px-6 py-16 text-sm text-muted">Loading applications…</div>
        </div>
      ) : rowsForBucket.length === 0 ? (
        <PortalDataTableEmpty
          icon="application"
          message={
            scopedRows.length === 0
              ? "No applications yet."
              : propertyFilter.trim()
                ? "No applications for this property yet."
                : "No applications in this tab yet."
          }
        />
      ) : (
      <>
      <div className="space-y-2 lg:hidden">
        {rowsForBucket.map((row) => {
          const expanded = expandedId === row.id;
          return (
            <div key={row.id} id={`portal-application-${row.id}`} className={PORTAL_MOBILE_CARD_CLASS}>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
              >
                <p className="truncate font-semibold text-foreground">{row.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {[displayRoomForRow(row), stripPropertyRoomCountSuffix(row.property || "")].filter(Boolean).join(" · ")}
                </p>
                {row.email ? <p className="mt-0.5 truncate text-[11px] text-muted/90">{row.email}</p> : null}
              </button>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {row.bucket === "pending" ? (
                  <>
                    <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN_PRIMARY} onClick={() => setApprovePreviewRow(row)}>
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={PORTAL_DETAIL_BTN}
                      data-attr="open-run-screening"
                      onClick={() => setCheckrScreeningRowId(row.id)}
                    >
                      Run screening
                    </Button>
                  </>
                ) : null}
                <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}>
                  {expanded ? "Less" : "Review"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={PORTAL_DETAIL_BTN}
                  data-attr="application-pdf-download"
                  onClick={() => downloadApplicationPdf(row)}
                >
                  PDF
                </Button>
              </div>
              {expanded ? (
                <div className="mt-3 border-t border-border pt-3">{renderApplicationDetail(row)}</div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className={PORTAL_TABLE_HEAD_ROW}>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Applicant</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Room</th>
              </tr>
            </thead>
            <tbody>
              {rowsForBucket.map((row) => (
                  <Fragment key={row.id}>
                    <tr
                      id={`portal-application-${row.id}`}
                      className={PORTAL_TABLE_TR_EXPANDABLE}
                      onClick={createPortalRowExpandClick(() =>
                        setExpandedId((cur) => (cur === row.id ? null : row.id)),
                      )}
                      aria-expanded={expandedId === row.id}
                    >
                      <td className={`${PORTAL_TABLE_TD} align-middle`}>
                        <p className="font-medium leading-snug text-foreground">{row.name}</p>
                        {row.email ? <p className="mt-1.5 text-xs leading-relaxed text-muted">{row.email}</p> : null}
                      </td>
                      <td className={`${PORTAL_TABLE_TD} align-middle leading-relaxed`}>{row.property}</td>
                      <td className={`${PORTAL_TABLE_TD} align-middle leading-relaxed`}>{displayRoomForRow(row)}</td>
                    </tr>
                    {expandedId === row.id ? (
                      <tr className={PORTAL_TABLE_DETAIL_ROW}>
                        <td colSpan={3} className={PORTAL_TABLE_DETAIL_CELL}>
                          {renderApplicationDetail(row)}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </ManagerPortalPageShell>
      <PortalNotificationPreviewModal
        open={approvePreviewRow !== null}
        title="Approve application — account setup email"
        onClose={() => setApprovePreviewRow(null)}
        recipient={approvePreviewRow?.email ?? ""}
        subject={RESIDENT_WELCOME_EMAIL_SUBJECT}
        body={
          approvePreviewRow
            ? buildResidentWelcomeEmailBody({
                residentName: approvePreviewRow.name || undefined,
                axisId: approvePreviewRow.id,
                signupUrl: residentAccountCreationUrl("", approvePreviewRow.id),
              })
            : ""
        }
        intro={
          approvePreviewRow
            ? `Approving ${approvePreviewRow.name || approvePreviewRow.email} will update their application status and can send their Axis resident account setup email.`
            : undefined
        }
        confirmLabel="Approve & send setup email"
        confirmLabelWithoutMessage="Approve only"
        confirmBusy={approvePreviewRow !== null && approveBusyId === approvePreviewRow.id}
        confirmBusyLabel="Approving…"
        onConfirm={(skipMessage) => {
          if (!approvePreviewRow) return;
          const row = approvePreviewRow;
          setApprovePreviewRow(null);
          setApproveBusyId(row.id);
          void setRowBucket(row.id, "approved", { skipWelcomeEmail: skipMessage }).finally(() => setApproveBusyId(null));
        }}
      />
      <ShareLeadLinkModal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        kind="apply"
        properties={shareableProperties}
      />
    </>
  );
}
