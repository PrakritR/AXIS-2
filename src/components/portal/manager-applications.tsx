"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { Badge } from "@/components/ui/badge";
import { PortalNotificationPreviewModal } from "@/components/portal/portal-notification-preview-modal";
import { ShareLeadLinkModal } from "@/components/portal/share-lead-link-modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  ManagerPortalPageShell,
  PORTAL_HEADER_ACTION_BTN_RESPONSIVE,
  RESIDENT_DETAIL_HEADER_ACTION_BTN,
  RESIDENT_DETAIL_HEADER_ACTIONS_ROW,
} from "@/components/portal/portal-metrics";
import { ApplicationFilterSortFields } from "@/components/portal/application-filter-sort-fields";
import { PortalFilterSortSheet, portalFilterActiveCount } from "@/components/portal/portal-filter-sort-sheet";
import { PortalActiveFilterChips } from "@/components/portal/portal-filter-chips";
import { PortalListControlStack } from "@/components/portal/portal-list-control-stack";
import { PortalSectionActionRow, PortalPageHeaderMobileActionsRow } from "@/components/portal/portal-section-action-row";
import { PortalRecordDetailPage } from "@/components/portal/portal-record-detail-page";
import { PortalPersonRecordRow } from "@/components/portal/portal-record-row";
import { PORTAL_LIST_PAGE_BODY } from "@/components/portal/portal-inbox-ui";
import {
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PortalTableInlineExpand,
} from "@/components/portal/portal-data-table";
import { InboxAvatar } from "@/components/portal/portal-inbox-ui";
import { stripPropertyRoomCountSuffix } from "@/lib/portal-mobile-preview";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { ApplicationReviewLauncherRow } from "@/components/portal/application-review-launcher-row";
import { downloadBackgroundCheckForApplication } from "@/components/portal/application-screening-panel";
import { ApplicationVerificationPhotos } from "@/components/portal/application-verification-photos";
import { ManagerEditApplicationModal } from "@/components/portal/manager-edit-application-modal";
import { CheckrScreeningModal } from "@/components/portal/checkr-screening-modal";
import { ManagerScreeningSettingsButton, ManagerScreeningSettingsModal } from "@/components/portal/manager-screening-settings";
import { ManagerApplicationSettingsModal } from "@/components/portal/manager-application-settings-modal";
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
import { transitionApplicationBucket } from "@/lib/application-review";
import { applicationShowsBackgroundCheck } from "@/lib/application-background-check";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import {
  fetchCosignerSubmissionsForSignerAppId,
  readCosignerSubmissionsForSignerAppId,
} from "@/lib/cosigner-submissions-storage";
import { buildApplicationHtml } from "@/lib/manager-application-html";
import { applicationPdfFilename } from "@/lib/manager-application-pdf";
import {
  downloadFetchedUrl,
  portalDownloadToastMessage,
  type PortalDownloadResult,
} from "@/lib/portal-document-download";
import type { CosignerSubmission } from "@/lib/cosigner-submissions-storage";
import { getBundleChoiceLabel, getRoomChoiceLabel } from "@/lib/rental-application/data";
import {
  inProgressApplicationResumeUrl,
  isInProgressApplicationRow,
} from "@/lib/rental-application/in-progress-application";
import { isWithdrawnApplicationRow } from "@/lib/rental-application/resident-application-list";
import { ApplicationGroupSection, groupIdForRow, groupRowInputForRow } from "@/components/portal/application-group-section";
import {
  buildBundleApplicationGroups,
} from "@/lib/bundle-group/bundle-group-application";
import {
  describeGroupBadge,
  groupForRow,
} from "@/lib/rental-application/application-groups";
import {
  APPLICATION_COMPLETION_REMINDER_SUBJECT,
  buildApplicationCompletionReminderBody,
} from "@/lib/application-completion-reminder-email";
import {
  findHoldingDepositCharge,
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
import { usePortalNavigate } from "@/lib/portal-nav-client";
import {
  applicationDetailHref,
  applicationListHref,
} from "@/lib/portal-detail-routes";
import {
  appendPortalPropertyFilterQuery,
  parsePortalPropertyFilterQuery,
  sanitizePortalPropertyFilterIds,
} from "@/lib/portal-property-list-filters";

function applicationRowPropertyId(row: DemoApplicantRow): string {
  return row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
}

function applicationRowsForPropertyFilters(rows: DemoApplicantRow[], propertyFilters: string[]): DemoApplicantRow[] {
  if (propertyFilters.length === 0) return rows;
  return rows.filter((r) => propertyFilters.includes(applicationRowPropertyId(r)));
}

function countByBucket(rows: DemoApplicantRow[]) {
  const c = { pending: 0, approved: 0, rejected: 0 };
  for (const r of rows) {
    c[r.bucket] += 1;
  }
  return c;
}

/**
 * UI-only tab id. The stored data model only ever has three buckets
 * (`ManagerApplicationBucket`) — "Incomplete" is not one of them, it is the
 * subset of the "pending" bucket whose `stage` is still "In progress"
 * (`isInProgressApplicationRow`). Splitting it into its own TAB (rather than
 * leaving it mixed into Pending with just an annotated label) is a display
 * concern only; every row keeps `bucket: "pending"` in storage, so Approve /
 * Reject / delete and the underlying query are unaffected.
 */
type ManagerApplicationTabId = "pending" | "incomplete" | "approved" | "rejected";

/** Which tab a row belongs to for DISPLAY — never confuse with `row.bucket`. */
function tabForRow(row: DemoApplicantRow): ManagerApplicationTabId {
  if (row.bucket !== "pending") return row.bucket;
  return isInProgressApplicationRow(row) ? "incomplete" : "pending";
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

/** Fetch the application PDF and save it — works on phone via blob download or the share sheet. */
export async function downloadApplicationPdf(row: DemoApplicantRow): Promise<PortalDownloadResult> {
  if (typeof window === "undefined") return "failed";
  return downloadFetchedUrl(
    applicationPdfHref(row),
    applicationPdfFilename(row),
    "application/pdf",
    "Application",
  );
}

/** Fire-and-forget helper for click handlers that already show their own toast. */
export function runApplicationPdfDownload(
  row: DemoApplicantRow,
  showToast: (message: string) => void,
): void {
  void downloadApplicationPdf(row).then((result) => {
    const message = portalDownloadToastMessage(result, "application");
    if (message) showToast(message);
  });
}

function ApplicationPdfDownloadButton({
  row,
  label = "Download PDF",
  className = "h-8 rounded-full px-4 text-xs",
}: {
  row: DemoApplicantRow;
  label?: string;
  className?: string;
}) {
  const { showToast } = useAppUi();
  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      data-attr="application-pdf-download"
      onClick={() => runApplicationPdfDownload(row, showToast)}
    >
      {label}
    </Button>
  );
}

/**
 * Inline application preview — rendered from the application answers already on
 * the row (same HTML as the Documents tab). Download PDF still uses the API route.
 */
export function ApplicationDocumentPreview({
  row,
  collapsible = true,
  showDownload = true,
  bareCanvas = false,
}: {
  row: DemoApplicantRow;
  collapsible?: boolean;
  showDownload?: boolean;
  /** Flat on the portal page canvas — no white document card chrome. */
  bareCanvas?: boolean;
}) {
  const demo = isDemoModeActive();
  const [cosignerSubmissions, setCosignerSubmissions] = useState<CosignerSubmission[]>([]);
  const previewKey = [
    row.id,
    row.bucket,
    applicationRoomLabel(row),
    row.application?.hasCosigner === "yes" ? "cosigner" : "",
    row.application?.rentalType ?? "",
  ].join("|");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the row changes
    setCosignerSubmissions([]);
    if (row.application?.hasCosigner !== "yes") return;
    if (demo) {
      setCosignerSubmissions(readCosignerSubmissionsForSignerAppId(row.id));
      return;
    }
    let cancelled = false;
    void fetchCosignerSubmissionsForSignerAppId(row.id)
      .catch(() => readCosignerSubmissionsForSignerAppId(row.id))
      .then((rows) => {
        if (!cancelled) setCosignerSubmissions(rows);
      });
    return () => {
      cancelled = true;
    };
  }, [previewKey, demo, row.application?.hasCosigner, row.id]);

  const previewHtml = useMemo(
    () =>
      buildApplicationHtml(row, {
        roomLabel: applicationRoomLabel(row) || undefined,
        cosignerSubmissions,
      }),
    [row, cosignerSubmissions, previewKey],
  );

  const downloadButton = showDownload ? (
    <ApplicationPdfDownloadButton row={row} />
  ) : null;

  const iframeHtml = useMemo(() => {
    if (!bareCanvas) return previewHtml;
    return previewHtml.replace(
      "html, body { background: #fff; }",
      "html, body { background: transparent; }",
    );
  }, [bareCanvas, previewHtml]);

  const previewBody = (
    <div className={bareCanvas ? "w-full" : "overflow-hidden border-t border-border bg-white"}>
      <iframe
        key={previewKey}
        srcDoc={iframeHtml}
        title="Application document"
        sandbox="allow-same-origin"
        loading="lazy"
        className={
          bareCanvas
            ? "h-[min(70vh,720px)] w-full border-0 bg-transparent"
            : "h-[min(52vh,420px)] w-full border-0 bg-white"
        }
      />
    </div>
  );

  if (!collapsible) {
    return (
      <div className={bareCanvas ? "space-y-3" : "mt-4 space-y-3"}>
        {downloadButton ? (
          <div className="flex flex-nowrap items-center justify-start gap-2">{downloadButton}</div>
        ) : null}
        {previewBody}
      </div>
    );
  }

  return (
    <PortalCollapsibleSection
      title="Application"
      defaultExpanded={false}
      surfaceMuted={false}
      bareSurface
      hideToggleIcon
      className="mt-0"
      contentClassName="pt-0"
      toggleDataAttr="application-document-toggle"
      headerActions={downloadButton ?? undefined}
      headerActionsInline={Boolean(downloadButton)}
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

export function ManagerApplications({
  bucket: bucketProp = "pending",
  basePath = "/portal",
  applicationId: applicationIdProp,
}: {
  bucket?: ManagerApplicationTabId;
  basePath?: string;
  applicationId?: string;
}) {
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const navigate = usePortalNavigate();
  const openHandled = useRef(false);
  const [bucket, setBucket] = useState<ManagerApplicationTabId>(bucketProp);
  const [prevBucketProp, setPrevBucketProp] = useState(bucketProp);
  if (bucketProp !== prevBucketProp) {
    setPrevBucketProp(bucketProp);
    if (bucket !== bucketProp) setBucket(bucketProp);
  }
  // propertyFilters derived from URL (see appliedPropertyFilters below)
  const [searchQuery, setSearchQuery] = useState("");
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
  const [applicationSettingsOpen, setApplicationSettingsOpen] = useState(false);
  const [checkrScreeningRowId, setCheckrScreeningRowId] = useState<string | null>(null);
  useEffect(() => {
    if (!authReady) return;
    const sync = () => setRows(readManagerApplicationRows());
    const pull = () => void syncManagerApplicationsFromServer({ force: true, managerUserId: userId }).then(sync);
    sync();
    void syncManagerApplicationsFromServer({ managerUserId: userId }).then(sync);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, sync);
    const onVisible = () => {
      if (document.visibilityState === "visible") pull();
    };
    window.addEventListener("focus", pull);
    document.addEventListener("visibilitychange", onVisible);
    const poll = window.setInterval(pull, 20_000);
    return () => {
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, sync);
      window.removeEventListener("focus", pull);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(poll);
    };
  }, [authReady, userId]);

  // Returning from the Stripe screening checkout (?screening=paid|cancelled).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const screening = params.get("screening");
    if (!screening) return;
    if (screening === "paid") {
      showToast("Payment received. The background check is starting now.");
    } else if (screening === "cancelled") {
      showToast("Payment cancelled. No screening was ordered.");
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

  const propertyFilters = useMemo(
    () =>
      sanitizePortalPropertyFilterIds(
        parsePortalPropertyFilterQuery(searchParams),
        propertyOptions.map((o) => o.id),
      ),
    [searchParams, propertyOptions],
  );

  const setPropertyFilters = useCallback(
    (next: string[] | ((prev: string[]) => string[])) => {
      const resolved = typeof next === "function" ? next(propertyFilters) : next;
      const sanitized = sanitizePortalPropertyFilterIds(
        resolved,
        propertyOptions.map((o) => o.id),
      );
      router.replace(appendPortalPropertyFilterQuery(applicationListHref(basePath, bucket), sanitized), {
        scroll: false,
      });
    },
    [propertyFilters, propertyOptions, basePath, bucket, router],
  );

  const applicationsListHref = useCallback(
    (tab: ManagerApplicationTabId) =>
      appendPortalPropertyFilterQuery(applicationListHref(basePath, tab), propertyFilters),
    [basePath, propertyFilters],
  );

  const shareableProperties = useMemo(() => {
    void portfolioTick;
    return buildManagerShareablePropertyOptions(scopeUserId);
  }, [scopeUserId, portfolioTick]);

  const scopedRows = useMemo(() => {
    // `portfolioTick` is a cache-invalidation signal, not a value read here:
    // `applicationVisibleToPortalUser` consults the module-level property
    // pipeline cache, which React cannot see. Re-filter once that cache
    // hydrates so linked-property rows appear without a manual refresh.
    void portfolioTick;
    if (!scopeUserId) return [];
    return rows.filter((r) => applicationVisibleToPortalUser(r, scopeUserId, "applications"));
  }, [rows, scopeUserId, portfolioTick]);

  // Reconcile group applications across every bucket (a group can span pending / approved /
  // in-progress) so the whole household is visible from any one member's row.
  const applicationGroups = useMemo(
    () => buildBundleApplicationGroups(scopedRows.map(groupRowInputForRow)),
    [scopedRows],
  );

  const propertyFilteredRows = useMemo(
    () => applicationRowsForPropertyFilters(scopedRows, propertyFilters),
    [scopedRows, propertyFilters],
  );

  const counts = useMemo(() => countByBucket(propertyFilteredRows), [propertyFilteredRows]);
  const incompleteCount = useMemo(
    () => propertyFilteredRows.filter((r) => r.bucket === "pending" && isInProgressApplicationRow(r)).length,
    [propertyFilteredRows],
  );
  // "Pending" now means submitted and awaiting review — Incomplete (still a
  // draft) is its own tab, so it is subtracted out here rather than shown as
  // an annotation on top of the combined bucket count.
  const pendingReviewCount = counts.pending - incompleteCount;
  const tabs = useMemo(
    () =>
      [
        { id: "pending" as const, label: "Pending", count: pendingReviewCount },
        { id: "incomplete" as const, label: "Incomplete", count: incompleteCount },
        { id: "approved" as const, label: "Approved", count: counts.approved },
        { id: "rejected" as const, label: "Rejected", count: counts.rejected },
      ] as const,
    [counts, incompleteCount, pendingReviewCount],
  );

  const propertyFilterLabel = useMemo(() => {
    if (propertyFilters.length === 0) return "";
    if (propertyFilters.length === 1) {
      return propertyOptions.find((o) => o.id === propertyFilters[0])?.label ?? propertyFilters[0];
    }
    return `${propertyFilters.length} properties`;
  }, [propertyFilters, propertyOptions]);

  const rowsForBucket = useMemo(() => {
    const inBucket = propertyFilteredRows.filter((r) => tabForRow(r) === bucket);
    const q = searchQuery.trim().toLowerCase();
    const searched = q
      ? inBucket.filter((r) =>
          [r.name, r.email, r.property, r.id, r.application?.email]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : inBucket;
    return sortApplicationRows(searched, bucket === "approved" ? "approved" : "pending");
  }, [propertyFilteredRows, bucket, searchQuery]);

  const openDetailScreeningModal = useCallback((row: DemoApplicantRow) => {
    setCheckrScreeningRowId(row.id);
  }, []);

  const detailRow = useMemo(() => {
    if (!applicationIdProp) return null;
    const decoded = decodeURIComponent(applicationIdProp);
    return scopedRows.find((r) => r.id === decoded) ?? null;
  }, [applicationIdProp, scopedRows]);

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
      const tab = tabForRow(hit);
      setBucket(tab);
      router.replace(applicationsListHref(tab), { scroll: false });
      navigate(applicationDetailHref(basePath, tab, hit.id));
    });
    requestAnimationFrame(() => {
      document.getElementById(`portal-application-${hit.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    params.delete("open");
    params.delete("axisId");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [scopedRows, pathname, router, basePath, navigate]);

  const setRowBucket = async (id: string, nextBucket: ManagerApplicationBucket, opts?: { skipWelcomeEmail?: boolean }) => {
    const result = await transitionApplicationBucket(id, nextBucket, {
      userId: userId ?? null,
      skipWelcomeEmail: opts?.skipWelcomeEmail,
    });
    if (!result) return;
    setRows(readManagerApplicationRows());
    if (result.blocked) {
      showToast(result.message ?? "That change could not be saved.");
      return;
    }

    router.push(applicationsListHref(nextBucket));
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
    const nextRows = rows.filter((r) => r.id !== id);

    // Drop from the session cache as well as React state — `syncManagerApplicationsFromServer`
    // union-merges against `memoryRows`, so a server-deleted row that still lives in the
    // cache is resurrected on the next poll/focus sync (the captain's "glitch" report).
    writeManagerApplicationRows(nextRows);
    setRows(nextRows);

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

    const [syncedRows] = await Promise.all([
      syncManagerApplicationsFromServer({ force: true, managerUserId: userId }),
      syncHouseholdChargesFromServer(),
    ]);
    setRows(syncedRows);

    if (applicationIdProp) {
      navigate(applicationsListHref(bucket));
    }

    showToast(
      email
        ? "Application deleted. Resident account, payments, documents, inbox, and services were removed."
        : "Application deleted.",
    );
  };

  const sendApplicationReminder = async (
    row: DemoApplicantRow,
    channels?: { viaEmail?: boolean; viaSms?: boolean },
  ) => {
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
        body: JSON.stringify({
          applicationId: row.id,
          viaEmail: channels?.viaEmail !== false,
          viaSms: channels?.viaSms === true,
        }),
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
            ? "Email isn't configured. Opened a draft in your mail app instead."
            : `Couldn't send automatically${data.error ? ` (${data.error})` : ""}. Opened a draft in your mail app.`,
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

  const renderApplicationRowActions = (row: DemoApplicantRow) => {
    const isPending = row.bucket === "pending";
    const showsRunCheck =
      applicationShowsBackgroundCheck(row) && Boolean(row.application?.consentCredit) && row.backgroundCheck?.status !== "pending";
    const canDownloadScreening =
      row.backgroundCheck?.status === "complete" || (isDemoModeActive() && applicationShowsBackgroundCheck(row));

    const approveButton =
      isPending && !isWithdrawnApplicationRow(row) ? (
        <Button
          type="button"
          variant="outline"
          className={RESIDENT_DETAIL_HEADER_ACTION_BTN}
          data-attr="application-approve"
          onClick={() => setApprovePreviewRow(row)}
        >
          Approve
        </Button>
      ) : null;

    const rejectButton = isPending ? (
      <Button
        type="button"
        variant="outline"
        className={RESIDENT_DETAIL_HEADER_ACTION_BTN}
        data-attr="application-reject"
        onClick={() => setRowBucket(row.id, "rejected")}
      >
        Reject
      </Button>
    ) : null;

    const runCheckButton = showsRunCheck ? (
      <Button
        type="button"
        variant="outline"
        className={RESIDENT_DETAIL_HEADER_ACTION_BTN}
        data-attr="run-background-check"
        onClick={() => openDetailScreeningModal(row)}
      >
        Run background check
      </Button>
    ) : null;

    const downloadApplicationButton = (
      <Button
        type="button"
        variant="outline"
        className={RESIDENT_DETAIL_HEADER_ACTION_BTN}
        data-attr="application-pdf-download"
        onClick={() => runApplicationPdfDownload(row, showToast)}
      >
        Download application
      </Button>
    );

    const downloadScreeningButton = canDownloadScreening ? (
      <Button
        type="button"
        variant="outline"
        className={RESIDENT_DETAIL_HEADER_ACTION_BTN}
        data-attr="screening-pdf-download"
        onClick={() => downloadBackgroundCheckForApplication(row)}
      >
        Download background check
      </Button>
    ) : null;

    const moveToPendingButton = !isPending ? (
      <Button
        type="button"
        variant="outline"
        className={RESIDENT_DETAIL_HEADER_ACTION_BTN}
        data-attr="application-move-pending"
        onClick={() => setRowBucket(row.id, "pending")}
      >
        Move to pending
      </Button>
    ) : null;

    const sendReminderButton =
      isPending && !isWithdrawnApplicationRow(row) && isInProgressApplicationRow(row) ? (
        <Button
          type="button"
          variant="outline"
          className={RESIDENT_DETAIL_HEADER_ACTION_BTN}
          data-attr="application-send-reminder"
          disabled={reminderPreviewBusyId !== null || reminderBusyId !== null}
          onClick={() => void openReminderPreview(row)}
        >
          {reminderPreviewBusyId === row.id ? "Loading…" : "Send reminder"}
        </Button>
      ) : null;

    const deleteButton = (
      <Button
        type="button"
        variant="outline"
        className={`${RESIDENT_DETAIL_HEADER_ACTION_BTN} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)] portal-danger-outline`}
        data-attr="application-delete"
        onClick={() => void deleteApplication(row.id)}
      >
        Delete
      </Button>
    );

    const mobileOverflowMenu = (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={`${RESIDENT_DETAIL_HEADER_ACTION_BTN} max-md:px-2.5 max-md:text-base`}
            data-attr="application-more-actions"
            aria-label="More application actions"
          >
            …
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" backdrop>
          <DropdownMenuItem data-attr="application-pdf-download" onSelect={() => runApplicationPdfDownload(row, showToast)}>
            Download application
          </DropdownMenuItem>
          {canDownloadScreening ? (
            <DropdownMenuItem
              data-attr="screening-pdf-download"
              onSelect={() => downloadBackgroundCheckForApplication(row)}
            >
              Download background check
            </DropdownMenuItem>
          ) : null}
          {moveToPendingButton ? (
            <DropdownMenuItem data-attr="application-move-pending" onSelect={() => setRowBucket(row.id, "pending")}>
              Move to pending
            </DropdownMenuItem>
          ) : null}
          {sendReminderButton ? (
            <DropdownMenuItem
              data-attr="application-send-reminder"
              disabled={reminderPreviewBusyId !== null || reminderBusyId !== null}
              onSelect={() => void openReminderPreview(row)}
            >
              {reminderPreviewBusyId === row.id ? "Loading…" : "Send reminder"}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-attr="application-delete"
            className="text-[var(--status-overdue-fg)] focus:text-[var(--status-overdue-fg)]"
            onSelect={() => void deleteApplication(row.id)}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    return (
      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
        <PortalSectionActionRow variant="header" className={RESIDENT_DETAIL_HEADER_ACTIONS_ROW}>
          <div className="flex max-w-full flex-nowrap items-center gap-1 md:hidden">
            {approveButton}
            {rejectButton}
            {runCheckButton}
            {mobileOverflowMenu}
          </div>
          <div className="hidden max-w-full flex-nowrap items-center gap-1 md:flex">
            {approveButton}
            {rejectButton}
            {runCheckButton}
            {downloadApplicationButton}
            {downloadScreeningButton}
            {moveToPendingButton}
            {sendReminderButton}
            {deleteButton}
          </div>
        </PortalSectionActionRow>
      </div>
    );
  };

  const renderApplicationDetail = (row: DemoApplicantRow) => {
    const group = groupForRow(applicationGroups, { groupId: groupIdForRow(row) });
    // A holding deposit collected AT APPLICATION (a since-removed per-listing
    // choice, `holdingDepositTiming`) is never auto-refunded when the
    // application is later rejected or withdrawn: PropLane has no automated
    // refund flow, and whether the deposit is even refundable is a
    // legal/lease-terms question the manager must resolve directly with the
    // applicant. This is a read-only reminder, not a code decision.
    const rejectedOrWithdrawn = row.bucket === "rejected" || isWithdrawnApplicationRow(row);
    const rowPropertyId = row.application?.propertyId?.trim() || row.propertyId?.trim() || "";
    const paidDepositCharge =
      rejectedOrWithdrawn && row.email && rowPropertyId
        ? findHoldingDepositCharge(row.email, rowPropertyId, null, row.id)
        : undefined;
    const showPaidDepositNote = paidDepositCharge?.status === "paid";
    return (
    <>
      {showPaidDepositNote ? (
        <div className="rounded-xl border px-4 py-3 text-sm portal-banner-pending" data-attr="application-paid-deposit-note">
          <span className="font-semibold">Holding deposit already paid ({paidDepositCharge.amountLabel}).</span>{" "}
          {row.bucket === "rejected" ? "This application was rejected" : "This application was withdrawn"} —
          PropLane does not automatically refund it. Handle any refund directly with the applicant per your lease
          terms.
        </div>
      ) : null}
      {group ? (
        <ApplicationGroupSection group={group} bundleGroup={group} currentRowId={row.id} />
      ) : null}

      <ApplicationReviewLauncherRow
        row={row}
        bareCanvas
        showDownload={false}
        onScreeningUpdated={handleScreeningUpdated}
        onOpenScreeningModal={() => openDetailScreeningModal(row)}
      />

      <ApplicationVerificationPhotos row={row} />
    </>
    );
  };

  const applicationsFilterSort = (
    <PortalFilterSortSheet
      activeCount={portalFilterActiveCount([propertyFilters])}
      compactPanel
      onReset={() => setPropertyFilters([])}
      dataAttr="applications-filter-sheet-open"
      className="min-w-0 shrink-0"
    >
      <ApplicationFilterSortFields
        propertyOptions={propertyOptions}
        propertyFilters={propertyFilters}
        onPropertyFiltersChange={setPropertyFilters}
      />
    </PortalFilterSortSheet>
  );

  const applicationsScreeningButton = (
    <ManagerScreeningSettingsButton
      className="w-full shrink-0 md:w-auto"
      onClick={() => setScreeningModalOpen(true)}
    />
  );

  const applicationsPromoButton = (
    <Button
      type="button"
      variant="outline"
      className={PORTAL_HEADER_ACTION_BTN_RESPONSIVE}
      data-attr="application-settings-open"
      onClick={() => setApplicationSettingsOpen(true)}
    >
      Promo
    </Button>
  );

  const applicationsEditButton = (
    <Button
      type="button"
      variant="outline"
      className={PORTAL_HEADER_ACTION_BTN_RESPONSIVE}
      data-attr="edit-application-open"
      onClick={() => setEditApplicationOpen(true)}
      disabled={propertyOptions.length === 0}
      title={propertyOptions.length === 0 ? "Add a property before editing its application" : undefined}
    >
      Edit
    </Button>
  );

  const applicationsSendButton = (
    <Button
      type="button"
      variant="outline"
      className={PORTAL_HEADER_ACTION_BTN_RESPONSIVE}
      onClick={() => setInviteModalOpen(true)}
      disabled={shareableProperties.length === 0}
      title={shareableProperties.length === 0 ? "List a property as active before sending to prospects" : undefined}
    >
      Send
    </Button>
  );

  const applicationsHeaderActions = (
    <>
      {applicationsScreeningButton}
      {applicationsPromoButton}
      {applicationsEditButton}
      {applicationsSendButton}
    </>
  );

  const applicationsMobileActionsRow = (
    <PortalPageHeaderMobileActionsRow
      filter={applicationsFilterSort}
      actions={
        <PortalSectionActionRow variant="header" className="gap-2">
          {applicationsHeaderActions}
        </PortalSectionActionRow>
      }
    />
  );

  const applicationModals = (
    <>
      <PortalNotificationPreviewModal
        open={approvePreviewRow !== null}
        title="Approve application: account setup email"
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
        intro="Choose Email and/or SMS. Always saved to PropLane inbox."
        showSkipMessage={false}
        showChannelPicker
        emailAvailable
        smsAvailable
        confirmLabel="Send reminder"
        confirmBusy={reminderBusyId !== null}
        confirmBusyLabel="Sending…"
        onConfirm={(_skip, channels) => {
          if (!reminderPreview) return;
          void sendApplicationReminder(reminderPreview.row, channels);
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

  if (applicationIdProp && detailRow) {
    return (
      <>
        {applicationModals}
        <PortalRecordDetailPage
          pageTitle="Applications"
          title={detailRow.name}
          subtitle={detailRow.email}
          avatarName={detailRow.name}
          backHref={applicationsListHref(tabForRow(detailRow))}
          hideBackText
          bareHeader
          dataAttrBack="application-detail-back"
          inlineActions
          actions={renderApplicationRowActions(detailRow)}
        >
          {renderApplicationDetail(detailRow)}
        </PortalRecordDetailPage>
      </>
    );
  }

  return (
    <>
    <ManagerPortalPageShell
      title="Applications"
      hideTitleOnMobileNav
      titleInlineFilter={applicationsFilterSort}
      titleAside={applicationsHeaderActions}
      compactFilterRow
    >
      {applicationsMobileActionsRow}
      <PortalListControlStack
        className="mb-2 max-lg:mb-2"
        destinationInset
        destinations={tabs.map((t) => ({
          id: t.id,
          label: t.label,
          href: applicationsListHref(t.id),
          count: t.count,
          dataAttr: `applications-bucket-${t.id}`,
        }))}
        activeDestinationId={bucket}
        destinationAriaLabel="Application status"
        search={{
          value: searchQuery,
          onChange: setSearchQuery,
          placeholder: "Search applicants",
          dataAttr: "applications-search",
        }}
        activeFilterChips={
          propertyFilters.length > 0 ? (
            <PortalActiveFilterChips
              chips={[
                {
                  id: "property",
                  label: `Property: ${propertyFilterLabel}`,
                  onRemove: () => setPropertyFilters([]),
                },
              ]}
            />
          ) : null
        }
      />
      <div className="mt-2 space-y-4 max-md:mt-3">
      <ManagerScreeningSettingsModal open={screeningModalOpen} onClose={() => setScreeningModalOpen(false)} />
      <ManagerApplicationSettingsModal
        open={applicationSettingsOpen}
        onClose={() => setApplicationSettingsOpen(false)}
      />
      <CheckrScreeningModal
        key={checkrScreeningRowId ?? "none"}
        row={rows.find((r) => r.id === checkrScreeningRowId) ?? null}
        open={checkrScreeningRowId !== null}
        onClose={() => setCheckrScreeningRowId(null)}
        onUpdated={handleScreeningUpdated}
      />
      {!authReady && rows.length === 0 ? (
        <div className={PORTAL_DATA_TABLE_WRAP}>
          <ListSkeleton rows={5} showLeading={false} />
        </div>
      ) : rowsForBucket.length === 0 ? (
        <div className="px-3 py-2">
          <PortalDataTableEmpty
            icon="application"
            message={
              scopedRows.length === 0
                ? "No applications yet. When someone starts applying on your website, they show up here as Incomplete as soon as they enter their email, then move to Pending once they submit."
                : searchQuery.trim()
                  ? "No applications match your search."
                  : propertyFilters.length > 0
                    ? "No applications for this property yet."
                    : bucket === "pending"
                      ? "No pending applications. Submitted applications awaiting your review will appear here."
                      : bucket === "incomplete"
                        ? "No incomplete applications. Drafts started on your apply link appear here until submitted."
                        : "No applications in this tab yet."
            }
          />
        </div>
      ) : (
        <div
          className={`${PORTAL_LIST_PAGE_BODY} max-md:[&_.portal-inbox-row]:gap-3 max-md:[&_.portal-inbox-row]:px-3.5 max-md:[&_.portal-inbox-row]:py-3.5`}
        >
          {rowsForBucket.map((row) => {
            const room = displayRoomForRow(row);
            const subtitle = [stripPropertyRoomCountSuffix(row.property || ""), room]
              .filter((part) => part && part !== "—")
              .join(" · ");
            const group = groupForRow(applicationGroups, { groupId: groupIdForRow(row) });
            const groupBadge = group ? describeGroupBadge(group) : null;
            return (
              <PortalPersonRecordRow
                key={row.id}
                name={row.name}
                subtitle={subtitle || undefined}
                preview={row.email}
                badge={
                  groupBadge ? (
                    <Badge tone={groupBadge.tone}>{groupBadge.label}</Badge>
                  ) : undefined
                }
                onOpen={() => navigate(applicationDetailHref(basePath, bucket, row.id))}
                dataAttr="application-list-row"
              />
            );
          })}
        </div>
      )}
      </div>
    </ManagerPortalPageShell>
      {applicationModals}
    </>
  );
}
