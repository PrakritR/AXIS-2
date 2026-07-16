"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PortalNotificationPreviewModal } from "@/components/portal/portal-notification-preview-modal";
import { ShareLeadLinkModal } from "@/components/portal/share-lead-link-modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
  PORTAL_HEADER_ACTION_BTN,
} from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import {
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
<<<<<<< HEAD
  PortalTableDetailActions,
  PortalTableInlineExpand,
=======
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PortalTableDetailActions,
  PortalTableInlineExpand,
  createPortalRowExpandClick,
>>>>>>> fm/captain-wip-ship-s1
} from "@/components/portal/portal-data-table";
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
import {
  fetchCosignerSubmissionsForSignerAppId,
  readCosignerSubmissionsForSignerAppId,
  type CosignerSubmission,
} from "@/lib/cosigner-submissions-storage";
<<<<<<< HEAD
import { getBundleChoiceLabel, getRoomChoiceLabel } from "@/lib/rental-application/data";
import {
  inProgressApplicationResumeUrl,
  isInProgressApplicationRow,
} from "@/lib/rental-application/in-progress-application";
import {
  APPLICATION_COMPLETION_REMINDER_SUBJECT,
  buildApplicationCompletionReminderBody,
} from "@/lib/application-completion-reminder-email";
=======
import { buildApplicationHtml } from "@/lib/manager-application-html";
import { getRoomChoiceLabel } from "@/lib/rental-application/data";
>>>>>>> fm/captain-wip-ship-s1
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
import { isDemoModeActive, resolveManagerScopeUserId } from "@/lib/demo/demo-session";
import { triggerDocumentDownload } from "@/components/portal/resident-other-documents";
function countByBucket(rows: DemoApplicantRow[]) {
  const c = { pending: 0, approved: 0, rejected: 0 };
  for (const r of rows) {
    c[r.bucket] += 1;
  }
  return c;
}

type ApplicationStatusPill = {
  label: string;
  tone: "neutral" | "info" | "pending" | "confirmed" | "overdue";
};

/**
 * Presentation-only status pill for the Linear row — derived purely from the row's
 * existing bucket + screening signals (no new state, no writes).
 */
function applicationStatusPill(row: DemoApplicantRow): ApplicationStatusPill {
  if (row.bucket === "approved") return { label: "Approved", tone: "confirmed" };
  if (row.bucket === "rejected") return { label: "Rejected", tone: "overdue" };
  if (isInProgressApplicationRow(row)) return { label: "In progress", tone: "neutral" };
  const bg = row.backgroundCheckStatus;
  if (bg === "flagged") return { label: "Flagged", tone: "overdue" };
  if (bg === "passed") return { label: "Screened", tone: "info" };
  if (bg === "pending_review" || row.screening) return { label: "Screening", tone: "pending" };
  return { label: "New", tone: "info" };
}

/** Up-to-two-letter initials for the Linear-style circular row avatar. */
function applicantInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

/** Client-resolved room label used by both the PDF download and the inline document view. */
function applicationRoomLabel(row: DemoApplicantRow): string {
  const roomChoice = row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "";
  const roomLabel = getRoomChoiceLabel(roomChoice);
  if (roomLabel) return roomLabel;
  // Bundle applications carry no ranked room choice — label by the bundle.
  const bundleId = row.application?.bundleId?.trim() || "";
  const propertyId = row.application?.propertyId?.trim() || row.propertyId?.trim() || "";
  return bundleId && propertyId ? getBundleChoiceLabel(propertyId, bundleId) : "";
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
export async function downloadApplicationPdf(row: DemoApplicantRow): Promise<void> {
  const filename = `rental-application-${row.id}.pdf`;
  if (isDemoModeActive()) {
    const { buildDemoApplicationPdfDataUrl } = await import("@/lib/demo/demo-document-files");
    const cosignerSubmissions =
      row.application?.hasCosigner === "yes"
        ? await fetchCosignerSubmissionsForSignerAppId(row.id).catch(() =>
            readCosignerSubmissionsForSignerAppId(row.id),
          )
        : [];
    const url = await buildDemoApplicationPdfDataUrl(
      row,
      applicationRoomLabel(row) || undefined,
      cosignerSubmissions,
    );
    triggerDocumentDownload(url, filename);
    return;
  }
  triggerDocumentDownload(applicationPdfHref(row), filename);
}

/**
 * Inline application preview — rendered HTML matching the lease document frame
 * (no browser PDF toolbar). Download PDF still uses the same bytes as before.
 */
export function ApplicationDocumentPreview({
  row,
  collapsible = true,
  showDownload = true,
}: {
  row: DemoApplicantRow;
  collapsible?: boolean;
  showDownload?: boolean;
}) {
  const [cosignerSubmissions, setCosignerSubmissions] = useState<CosignerSubmission[]>([]);
  const [cosignerReady, setCosignerReady] = useState(row.application?.hasCosigner !== "yes");

  useEffect(() => {
    if (row.application?.hasCosigner !== "yes") {
      setCosignerSubmissions([]);
      setCosignerReady(true);
      return;
    }
    let cancelled = false;
    setCosignerReady(false);
    void fetchCosignerSubmissionsForSignerAppId(row.id)
      .catch(() => readCosignerSubmissionsForSignerAppId(row.id))
      .then((submissions) => {
        if (!cancelled) {
          setCosignerSubmissions(submissions);
          setCosignerReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [row.id, row.application?.hasCosigner]);

  const html = useMemo(() => {
    if (!cosignerReady) return null;
    return buildApplicationHtml(row, {
      roomLabel: applicationRoomLabel(row) || undefined,
      cosignerSubmissions,
    });
  }, [row, cosignerSubmissions, cosignerReady]);

  const downloadButton = showDownload ? (
    <Button
      type="button"
      variant="outline"
      className="h-8 rounded-full px-4 text-xs"
      data-attr="application-pdf-download"
      onClick={() => void downloadApplicationPdf(row)}
    >
      Download PDF
    </Button>
  ) : null;

  const previewBody = (
    <div className="overflow-hidden rounded-2xl border border-border bg-accent/30">
      <p className="border-b border-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
        Application document
      </p>
      {html ? (
        <iframe
          title="Application document"
          srcDoc={html}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          loading="lazy"
          className="h-[min(52vh,420px)] w-full bg-card"
        />
      ) : (
        <div className="flex h-[min(24vh,200px)] items-center justify-center px-4 text-center text-sm text-muted">
          Loading application…
        </div>
      )}
    </div>
  );

  if (!collapsible) {
    return (
      <div className="mt-4 space-y-3">
        {downloadButton ? <div className="flex justify-end">{downloadButton}</div> : null}
        {previewBody}
      </div>
    );
  }

  return (
    <PortalCollapsibleSection
      title="Application"
      defaultExpanded={false}
      surfaceMuted={false}
      className="mt-4"
      contentClassName="p-4 pt-0"
      toggleDataAttr="application-document-toggle"
      headerActions={downloadButton ?? undefined}
    >
      {previewBody}
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
  if (!raw) {
    // Bundle applications carry no ranked room choice — show the bundle name.
    const bundleId = row.application?.bundleId?.trim() || "";
    const propertyId = row.application?.propertyId?.trim() || row.propertyId?.trim() || "";
    const bundle = bundleId && propertyId ? getBundleChoiceLabel(propertyId, bundleId) : "";
    return bundle.split(" · ")[0]?.trim() || "—";
  }
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
  const [reminderBusyId, setReminderBusyId] = useState<string | null>(null);
  const [reminderPreviewBusyId, setReminderPreviewBusyId] = useState<string | null>(null);
  const [reminderPreview, setReminderPreview] = useState<
    { row: DemoApplicantRow; to: string; subject: string; text: string } | null
  >(null);
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

  // Returning from the Stripe screening checkout (?screening=paid|cancelled).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const screening = params.get("screening");
    if (!screening) return;
    if (screening === "paid") {
      showToast("Payment received — the background check is starting now.");
    } else if (screening === "cancelled") {
      showToast("Payment cancelled — no screening was ordered.");
    }
    params.delete("screening");
    params.delete("session_id");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [showToast]);

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
    return rows.filter((r) => applicationVisibleToPortalUser(r, scopeUserId, "applications"));
  }, [rows, scopeUserId]);

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

  const sendApplicationReminder = async (row: DemoApplicantRow) => {
    if (reminderBusyId) return;
    setReminderBusyId(row.id);
    try {
      // Demo mode must never trigger a real email/write — simulate success locally.
      if (isDemoModeActive()) {
        showToast("Reminder sent to the applicant.");
        return;
      }
      const res = await fetch("/api/portal/send-application-completion-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ applicationId: row.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; mailtoHref?: string };
      if (res.ok && data.ok) {
        showToast("Application reminder sent to the applicant.");
        return;
      }
      // A draft is offered both when email isn't set up (503) and when a real send
      // fails (502) — keep the copy accurate to which happened, and surface the real
      // error on a genuine failure rather than blaming configuration.
      if (typeof data.mailtoHref === "string" && data.mailtoHref) {
        const { openMailtoHref } = await import("@/lib/resident-welcome-email");
        openMailtoHref(data.mailtoHref);
        showToast(
          res.status === 503
            ? "Email isn't configured — opened a draft in your mail app instead."
            : `Couldn't send automatically${data.error ? ` (${data.error})` : ""} — opened a draft in your mail app.`,
        );
        return;
      }
      showToast(data.error ?? "Could not send the application reminder.");
    } catch {
      showToast("Could not send the application reminder.");
    } finally {
      setReminderBusyId(null);
      // The confirm action is terminal (sent, drafted, or errored) — close the preview.
      setReminderPreview(null);
    }
  };

  // Load the exact email that would be sent (same auth/recipient/copy) so the manager
  // can confirm before anything goes out. Demo mode builds the preview locally since the
  // route can't resolve synthetic demo ids and must never send.
  const openReminderPreview = async (row: DemoApplicantRow) => {
    if (reminderPreviewBusyId || reminderBusyId) return;
    setReminderPreviewBusyId(row.id);
    try {
      if (isDemoModeActive()) {
        const origin = typeof window === "undefined" ? "" : window.location.origin;
        const text = buildApplicationCompletionReminderBody({
          applicantName: row.name || undefined,
          propertyTitle: row.property || undefined,
          resumeUrl: inProgressApplicationResumeUrl(origin, row),
          signInUrl: `${origin}/auth/sign-in?role=resident`,
        });
        setReminderPreview({
          row,
          to: row.email?.trim() || "the applicant",
          subject: APPLICATION_COMPLETION_REMINDER_SUBJECT,
          text,
        });
        return;
      }
      const res = await fetch("/api/portal/send-application-completion-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ applicationId: row.id, preview: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        preview?: { to?: string; subject?: string; text?: string };
      };
      if (res.ok && data.ok && data.preview) {
        setReminderPreview({
          row,
          to: data.preview.to ?? "",
          subject: data.preview.subject ?? APPLICATION_COMPLETION_REMINDER_SUBJECT,
          text: data.preview.text ?? "",
        });
        return;
      }
      showToast(data.error ?? "Could not load the reminder preview.");
    } catch {
      showToast("Could not load the reminder preview.");
    } finally {
      setReminderPreviewBusyId(null);
    }
  };

  const renderApplicationDetail = (row: DemoApplicantRow) => (
    <>
      <PortalTableDetailActions placement="top">
        {row.bucket === "pending" ? (
          <>
            <Button type="button" variant="primary" className={PORTAL_DETAIL_BTN} data-attr="application-approve" onClick={() => setApprovePreviewRow(row)}>
              Approve
            </Button>
            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => setRowBucket(row.id, "rejected")}>
              Reject
            </Button>
            {isInProgressApplicationRow(row) ? (
              <Button
                type="button"
                variant="outline"
                className={PORTAL_DETAIL_BTN}
                data-attr="application-send-reminder"
                // Disabled while ANY reminder preview/send is in flight so a click on
                // another row isn't silently dropped by the single-flight guards.
                disabled={reminderPreviewBusyId !== null || reminderBusyId !== null}
                onClick={() => void openReminderPreview(row)}
              >
                {reminderPreviewBusyId === row.id ? "Loading…" : "Send reminder"}
              </Button>
            ) : null}
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

      <ApplicationDocumentPreview row={row} />

      <ApplicationScreeningPanel
        row={row}
        onUpdated={handleScreeningUpdated}
        onOpenScreeningModal={() => setCheckrScreeningRowId(row.id)}
      />
    </>
  );

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
            Edit
            <ChevronDown className="h-4 w-4 text-muted" aria-hidden />
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
          <ManagerPortalStatusPills tabs={[...tabs]} activeId={bucket} onChange={(id) => setBucket(id as ManagerApplicationBucket)} />
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
                : "No applications in this tab yet."
          }
        />
      ) : (
<<<<<<< HEAD
      <div className={PORTAL_DATA_TABLE_WRAP}>
        <ul className="divide-y divide-[var(--border)]">
          {rowsForBucket.map((row) => {
            const expanded = expandedId === row.id;
            const status = applicationStatusPill(row);
            const room = displayRoomForRow(row);
            const subtitle = [stripPropertyRoomCountSuffix(row.property || ""), room]
              .filter((part) => part && part !== "—")
              .join(" · ");
            return (
              <li key={row.id} id={`portal-application-${row.id}`}>
                <button
                  type="button"
                  className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40 sm:gap-3.5 sm:px-5 sm:py-3.5"
                  onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                  aria-expanded={expanded}
                >
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-[var(--secondary)] text-[11px] font-semibold uppercase tracking-[0.02em] text-muted"
                  >
                    {applicantInitials(row.name)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <PortalTableInlineExpand expanded={expanded} className="font-medium text-foreground">
                      <span className="truncate">{row.name}</span>
                    </PortalTableInlineExpand>
                    {subtitle ? (
                      <span className="mt-0.5 block truncate text-xs text-muted">{subtitle}</span>
=======
      <>
      <div className="space-y-2 lg:hidden">
        {rowsForBucket.map((row) => {
          const expanded = expandedId === row.id;
          return (
            <div key={row.id} id={`portal-application-${row.id}`} className={PORTAL_MOBILE_CARD_CLASS}>
              <button
                type="button"
                className="flex w-full gap-2 text-left"
                onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                aria-expanded={expanded}
              >
                <div className="min-w-0 flex-1">
                  <PortalTableInlineExpand expanded={expanded} className="font-semibold text-foreground">
                    <span className="truncate">{row.name}</span>
                  </PortalTableInlineExpand>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {[displayRoomForRow(row), stripPropertyRoomCountSuffix(row.property || "")].filter(Boolean).join(" · ")}
                  </p>
                  {row.email ? <p className="mt-0.5 truncate text-[11px] text-muted/90">{row.email}</p> : null}
                </div>
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
          <table className="w-full table-fixed border-collapse text-left text-sm">
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
                        <PortalTableInlineExpand expanded={expandedId === row.id} className="font-medium text-foreground">
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
>>>>>>> fm/captain-wip-ship-s1
                    ) : null}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center">
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </span>
                </button>
                {expanded ? (
                  <div className="border-t border-border px-4 py-4 sm:px-5 sm:py-5">
                    {renderApplicationDetail(row)}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
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
            ? `Approving ${approvePreviewRow.name || approvePreviewRow.email} will update their application status and can send their PropLane resident account setup email.`
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
        open={reminderPreview !== null}
        title="Send application reminder"
        onClose={() => setReminderPreview(null)}
        recipient={reminderPreview?.to ?? ""}
        subject={reminderPreview?.subject ?? APPLICATION_COMPLETION_REMINDER_SUBJECT}
        body={reminderPreview?.text ?? ""}
        intro="This is the exact email that will be sent to the applicant to finish their application."
        showSkipMessage={false}
        confirmLabel="Send reminder"
        confirmBusy={reminderBusyId !== null}
        confirmBusyLabel="Sending…"
        onConfirm={() => {
          if (!reminderPreview) return;
          void sendApplicationReminder(reminderPreview.row);
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
