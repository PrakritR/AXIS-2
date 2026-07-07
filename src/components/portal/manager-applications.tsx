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
  PORTAL_HEADER_ACTION_BTN,
} from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { PORTAL_DATA_TABLE, PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PortalTableDetailActions,
  PortalTableInlineExpand,
  createPortalRowExpandClick,} from "@/components/portal/portal-data-table";
import { stripPropertyRoomCountSuffix } from "@/lib/portal-mobile-preview";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { ApplicationScreeningPanel } from "@/components/portal/application-screening-panel";
import { ManagerEditApplicationModal } from "@/components/portal/manager-edit-application-modal";
import { CheckrScreeningModal } from "@/components/portal/checkr-screening-modal";
import { ManagerScreeningSettingsButton, ManagerScreeningSettingsModal } from "@/components/portal/manager-screening-settings";
import type { DemoApplicantRow, ManagerApplicationBucket } from "@/data/demo-portal";
import {
  MANAGER_APPLICATIONS_EVENT,
  deleteManagerApplicationFromServer,
  normalizeApplicationAxisId,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import {
  MANAGER_PORTFOLIO_REFRESH_EVENTS,
  applicationVisibleToPortalUser,
  buildManagerPropertyFilterOptions,
} from "@/lib/manager-portfolio-access";
import { buildManagerShareablePropertyOptions } from "@/lib/manager-property-links";
import { syncPropertyPipelineFromServer, hasCachedPropertyPipeline } from "@/lib/demo-property-pipeline";
import { transitionApplicationBucket } from "@/lib/application-review";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import {
  APPLICATION_COMPLETION_REMINDER_SUBJECT,
  buildApplicationCompletionReminderBody,
} from "@/lib/application-completion-reminder-email";
import {
  inProgressApplicationResumeUrl,
  isInProgressApplicationRow,
  isSubmittedPendingApplicationRow,
} from "@/lib/rental-application/in-progress-application";
import {
  fetchCosignerSubmissionsForSignerAppId,
  readCosignerSubmissionsForSignerAppId,
} from "@/lib/cosigner-submissions-storage";
import { getRoomChoiceLabel } from "@/lib/rental-application/data";
import {
  removeAllApplicationCharges,
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
import { clearUploadedOwnLease } from "@/lib/resident-lease-upload";
import { loadPersistedInbox, MANAGER_INBOX_STORAGE_KEY, persistInbox } from "@/lib/portal-inbox-storage";
import {
  RESIDENT_WELCOME_EMAIL_SUBJECT,
  buildResidentWelcomeEmailBody,
  residentAccountCreationUrl,
} from "@/lib/resident-welcome-email";
import { resolveManagerScopeUserId } from "@/lib/demo/demo-session";

type ManagerApplicationsTab = ManagerApplicationBucket | "in_progress";

function countApplications(rows: DemoApplicantRow[]) {
  const c = { pending: 0, inProgress: 0, approved: 0, rejected: 0 };
  for (const r of rows) {
    if (r.bucket === "pending") {
      if (isInProgressApplicationRow(r)) c.inProgress += 1;
      else c.pending += 1;
    } else if (r.bucket === "approved") {
      c.approved += 1;
    } else if (r.bucket === "rejected") {
      c.rejected += 1;
    }
  }
  return c;
}

/** Client-resolved room label used by both the PDF download and the inline document view. */
function applicationRoomLabel(row: DemoApplicantRow): string {
  const roomChoice = row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "";
  return getRoomChoiceLabel(roomChoice);
}

/** Server PDF endpoint for an application, with the client-resolved room label as a display hint. */
export function applicationPdfHref(row: DemoApplicantRow, opts?: { inline?: boolean }): string {
  const params = new URLSearchParams();
  const roomLabel = applicationRoomLabel(row);
  if (roomLabel) params.set("roomLabel", roomLabel);
  if (opts?.inline) params.set("disposition", "inline");
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
 * Inline application preview — the same PDF bytes as Download PDF, embedded without
 * opening a new tab (demo builds the PDF locally; production uses the API route).
 */
export function ApplicationDocumentPreview({ row }: { row: DemoApplicantRow }) {
  const demo = isDemoModeActive();
  const [pdfSrc, setPdfSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (demo) {
      void (async () => {
        const cosignerSubmissions =
          row.application?.hasCosigner === "yes"
            ? await fetchCosignerSubmissionsForSignerAppId(row.id).catch(() =>
                readCosignerSubmissionsForSignerAppId(row.id),
              )
            : [];
        const { buildDemoApplicationPdfDataUrl } = await import("@/lib/demo/demo-document-files");
        const url = await buildDemoApplicationPdfDataUrl(row, applicationRoomLabel(row) || undefined, cosignerSubmissions);
        if (!cancelled) setPdfSrc(url);
      })();
      return () => {
        cancelled = true;
      };
    }
    setPdfSrc(`${applicationPdfHref(row, { inline: true })}#toolbar=0&navpanes=0`);
    return () => {
      cancelled = true;
    };
  }, [row, demo]);

  return (
    <PortalCollapsibleSection
      title="Application"
      defaultExpanded={false}
      surfaceMuted={false}
      className="mt-4"
      contentClassName="p-4 pt-0"
      toggleDataAttr="application-document-toggle"
      headerActions={
        <Button
          type="button"
          variant="outline"
          className="h-8 rounded-full px-4 text-xs"
          data-attr="application-pdf-download"
          onClick={() => downloadApplicationPdf(row)}
        >
          Download PDF
        </Button>
      }
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        {pdfSrc ? (
          <iframe
            key={pdfSrc}
            src={pdfSrc}
            title="Application document"
            loading="lazy"
            className="h-[min(52vh,420px)] w-full border-0 bg-white"
          />
        ) : (
          <div className="flex h-[min(24vh,200px)] items-center justify-center px-4 text-center text-sm text-muted">
            Loading application PDF…
          </div>
        )}
      </div>
    </PortalCollapsibleSection>
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
  const [bucket, setBucket] = useState<ManagerApplicationsTab>("pending");
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
  const [reminderPreviewRow, setReminderPreviewRow] = useState<DemoApplicantRow | null>(null);
  const [reminderBusyId, setReminderBusyId] = useState<string | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editApplicationOpen, setEditApplicationOpen] = useState(false);
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

  const handleScreeningUpdated = useCallback(() => {
    void syncManagerApplicationsFromServer({ managerUserId: userId }).then(setRows);
  }, [userId]);

  const scopeUserId = resolveManagerScopeUserId(userId);

  const propertyOptions = buildManagerPropertyFilterOptions(scopeUserId);
  const shareableProperties = useMemo(() => buildManagerShareablePropertyOptions(scopeUserId), [scopeUserId, portfolioTick]);

  const scopedRows = useMemo(() => {
    if (!scopeUserId) return [];
    return rows.filter((r) => applicationVisibleToPortalUser(r, scopeUserId));
  }, [rows, scopeUserId]);

  const counts = useMemo(() => countApplications(scopedRows), [scopedRows]);
  const tabs = useMemo(
    () =>
      [
        {
          id: "in_progress" as const,
          label: "In progress",
          count: counts.inProgress,
          dataAttr: "applications-in-progress-tab",
        },
        { id: "pending" as const, label: "Pending", count: counts.pending, dataAttr: "applications-pending-tab" },
        { id: "approved" as const, label: "Approved", count: counts.approved, dataAttr: "applications-approved-tab" },
        { id: "rejected" as const, label: "Rejected", count: counts.rejected, dataAttr: "applications-rejected-tab" },
      ] as const,
    [counts],
  );

  const rowsForBucket = useMemo(() => {
    const inBucket = scopedRows.filter((r) => {
      if (bucket === "in_progress") return isInProgressApplicationRow(r);
      if (bucket === "pending") return isSubmittedPendingApplicationRow(r);
      return r.bucket === bucket;
    });
    const filtered = !propertyFilter.trim()
      ? inBucket
      : inBucket.filter((r) => (r.assignedPropertyId?.trim() || r.propertyId?.trim() || r.application?.propertyId?.trim()) === propertyFilter);
    return sortApplicationRows(filtered, bucket === "in_progress" ? "pending" : bucket);
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
      setBucket(isInProgressApplicationRow(hit) ? "in_progress" : hit.bucket);
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
    const result = await transitionApplicationBucket(id, nextBucket, {
      userId: userId ?? null,
      skipWelcomeEmail: opts?.skipWelcomeEmail,
    });
    if (!result) return;
    setRows(readManagerApplicationRows());

    setExpandedId(null);
    setBucket(nextBucket);
    const msg =
      nextBucket === "approved"
        ? opts?.skipWelcomeEmail
          ? "Application approved (no setup email sent)."
          : result.welcomeSent
            ? "Application approved. A welcome email with portal setup was sent to the applicant."
            : "Application approved."
        : nextBucket === "rejected"
          ? "Application rejected."
          : "Moved to Pending.";
    showToast(msg);
  };

  const purgeResidentLocalData = (residentEmail: string, applicationId: string) => {
    const email = residentEmail.trim().toLowerCase();
    if (!email) return;

    removeResidentHouseholdPaymentData(residentEmail);
    removeAllApplicationCharges(applicationId, userId ?? null);
    deleteLeasePipelineRowsForResident(residentEmail, applicationId, userId);
    deleteManagerWorkOrdersForResident(residentEmail);
    deleteServiceRequestsForResident(residentEmail);
    clearUploadedOwnLease(residentEmail);

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
  };

  const deleteApplication = async (id: string) => {
    const row = rows.find((candidate) => candidate.id === id);
    const email = row?.email?.trim().toLowerCase();

    setRows((prev) => prev.filter((r) => r.id !== id));
    setExpandedId(null);

    let serverError: string | null = null;
    if (email || id) {
      try {
        const res = await fetch("/api/portal/delete-resident-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, purgeData: true, applicationId: id }),
        });
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          serverError = body?.error ?? "Could not delete application and resident data.";
        }
      } catch {
        serverError = "Could not delete application and resident data.";
      }
    } else {
      const result = await deleteManagerApplicationFromServer(id);
      if (!result.ok) serverError = result.error ?? "Could not delete application.";
    }

    if (serverError) {
      setRows(await syncManagerApplicationsFromServer({ managerUserId: userId }));
      showToast(serverError);
      return;
    }

    if (email) {
      purgeResidentLocalData(email, id);
    } else {
      removeAllApplicationCharges(id, userId ?? null);
    }

    await Promise.all([
      syncManagerApplicationsFromServer({ force: true, managerUserId: userId }),
      syncHouseholdChargesFromServer(),
    ]);

    showToast(
      email
        ? "Application deleted. Resident account, payments, documents, inbox, and services were removed."
        : "Application deleted.",
    );
  };

  const sendCompletionReminder = async (row: DemoApplicantRow) => {
    if (isDemoModeActive()) {
      showToast("Completion reminder preview only in demo mode.");
      return;
    }
    setReminderBusyId(row.id);
    try {
      const res = await fetch("/api/portal/send-application-completion-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ applicationId: row.id }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; mailtoHref?: string } | null;
      if (!res.ok) {
        if (body?.mailtoHref) {
          window.location.href = body.mailtoHref;
          showToast("Email is not configured — opened your mail app instead.");
          return;
        }
        showToast(body?.error ?? "Could not send completion reminder.");
        return;
      }
      showToast("Completion reminder sent.");
    } catch {
      showToast("Could not send completion reminder.");
    } finally {
      setReminderBusyId(null);
    }
  };

  const renderApplicationDetail = (row: DemoApplicantRow) => {
    const inProgress = isInProgressApplicationRow(row);

    return (
    <>
      <PortalTableDetailActions placement="top">
        {inProgress ? (
          <Button
            type="button"
            variant="primary"
            className={PORTAL_DETAIL_BTN}
            data-attr="application-send-completion-reminder"
            onClick={() => setReminderPreviewRow(row)}
          >
            Send completion reminder
          </Button>
        ) : row.bucket === "pending" ? (
          <>
            <Button type="button" variant="primary" className={PORTAL_DETAIL_BTN} onClick={() => setApprovePreviewRow(row)}>
              Approve
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
          className={`${PORTAL_DETAIL_BTN} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)] portal-danger-outline`}
          onClick={() => void deleteApplication(row.id)}
        >
          Delete
        </Button>
      </PortalTableDetailActions>

      {!inProgress ? (
        <>
          <ApplicationDocumentPreview row={row} />
          <ApplicationScreeningPanel
            row={row}
            onUpdated={handleScreeningUpdated}
            onOpenScreeningModal={() => setCheckrScreeningRowId(row.id)}
          />
        </>
      ) : null}
    </>
    );
  };

  return (
    <>
    <ManagerPortalPageShell
      title="Applications"
      titleAside={
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <ManagerScreeningSettingsButton onClick={() => setScreeningModalOpen(true)} />
          <Button
            type="button"
            variant="outline"
            className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
            data-attr="edit-application-open"
            onClick={() => setEditApplicationOpen(true)}
            disabled={propertyOptions.length === 0}
            title={propertyOptions.length === 0 ? "Add a property before editing its application" : undefined}
          >
            Edit application
          </Button>
          <Button
            type="button"
            variant="outline"
            className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
            onClick={() => setInviteModalOpen(true)}
            disabled={shareableProperties.length === 0}
            title={shareableProperties.length === 0 ? "List a property as active before inviting prospects" : undefined}
          >
            Invite
          </Button>
        </div>
      }
      filterRow={
        <ManagerPortalFilterRow>
          <ManagerPortalStatusPills tabs={[...tabs]} activeId={bucket} onChange={(id) => setBucket(id as ManagerApplicationsTab)} />
          <PortalPropertyFilterPill
            propertyOptions={propertyOptions}
            propertyValue={propertyFilter}
            onPropertyChange={(id) => setPropertyFilter(id)}
          />
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
                : bucket === "in_progress"
                  ? "No in-progress applications yet."
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
                aria-expanded={expanded}
              >
                <PortalTableInlineExpand expanded={expanded} className="font-semibold text-foreground">
                  <span className="truncate">{row.name}</span>
                </PortalTableInlineExpand>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {[displayRoomForRow(row), stripPropertyRoomCountSuffix(row.property || "")].filter(Boolean).join(" · ")}
                </p>
                {row.email ? <p className="mt-0.5 truncate text-[11px] text-muted/90">{row.email}</p> : null}
              </button>
              {expanded ? (
                <div className="mt-3 border-t border-border pt-3">{renderApplicationDetail(row)}</div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className={PORTAL_DATA_TABLE}>
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
                        <PortalTableInlineExpand expanded={expandedId === row.id} className="font-medium leading-snug text-foreground">
                          {row.name}
                        </PortalTableInlineExpand>
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
      <PortalNotificationPreviewModal
        open={reminderPreviewRow !== null}
        title="Send completion reminder"
        onClose={() => setReminderPreviewRow(null)}
        recipient={reminderPreviewRow?.email ?? ""}
        subject={APPLICATION_COMPLETION_REMINDER_SUBJECT}
        body={
          reminderPreviewRow
            ? buildApplicationCompletionReminderBody({
                applicantName: reminderPreviewRow.name || undefined,
                propertyTitle: reminderPreviewRow.property || undefined,
                resumeUrl: inProgressApplicationResumeUrl(
                  typeof window !== "undefined" ? window.location.origin : "https://www.axis-seattle-housing.com",
                  reminderPreviewRow,
                ),
                signInUrl: `${typeof window !== "undefined" ? window.location.origin : "https://www.axis-seattle-housing.com"}/auth/sign-in?role=resident`,
              })
            : ""
        }
        intro={
          reminderPreviewRow
            ? `Email ${reminderPreviewRow.name || reminderPreviewRow.email} a link to finish their rental application.`
            : undefined
        }
        confirmLabel="Send reminder"
        confirmBusy={reminderPreviewRow !== null && reminderBusyId === reminderPreviewRow.id}
        confirmBusyLabel="Sending…"
        onConfirm={() => {
          if (!reminderPreviewRow) return;
          const row = reminderPreviewRow;
          setReminderPreviewRow(null);
          void sendCompletionReminder(row);
        }}
      />
      <ShareLeadLinkModal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        kind="apply"
        properties={shareableProperties}
      />
      <ManagerEditApplicationModal
        open={editApplicationOpen}
        onClose={() => setEditApplicationOpen(false)}
        propertyOptions={propertyOptions}
        managerUserId={userId}
        onSaved={() => setPortfolioTick((n) => n + 1)}
        showToast={showToast}
      />
    </>
  );
}
