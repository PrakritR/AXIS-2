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
import { ManagerApplicationReadonlyReview } from "@/components/portal/manager-application-readonly-review";
import { ApplicationScreeningPanel } from "@/components/portal/application-screening-panel";
import { ManagerScreeningSettingsButton, ManagerScreeningSettingsModal } from "@/components/portal/manager-screening-settings";
import { ManagerCosignerReadonlyReview } from "@/components/portal/manager-cosigner-readonly-review";
import { fetchCosignerSubmissionsForSignerAppId, type CosignerSubmission } from "@/lib/cosigner-submissions-storage";
import type { DemoApplicantRow, ManagerApplicationBucket } from "@/data/demo-portal";
import {
  MANAGER_APPLICATIONS_EVENT,
  deleteManagerApplicationFromServer,
  effectiveApplicationForRow,
  normalizeApplicationAxisId,
  readManagerApplicationRows,
  resolveApplicationPersonalFields,
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
import { getPropertyById, getRoomChoiceLabel, SHORT_TERM_LEASE_TERM } from "@/lib/rental-application/data";
import { formatLeaseDateLabel } from "@/lib/rental-application/lease-dates";
import { resolvePlacementValuesForRow } from "@/lib/rental-application/placement-values";
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
import {
  applicationShowsBackgroundCheck,
  backgroundCheckStatusClassName,
  backgroundCheckStatusLabel,
  resolveBackgroundCheckStatus,
} from "@/lib/application-background-check";
import { recommendationLabel } from "@/lib/screening/recommendation";

function ApplicationBackgroundCheckStatusBadge({ row }: { row: DemoApplicantRow }) {
  if (!applicationShowsBackgroundCheck(row)) return null;
  const status = resolveBackgroundCheckStatus(row);
  const screening = row.screening;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <span
        className={`inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${backgroundCheckStatusClassName(status)}`}
      >
        {backgroundCheckStatusLabel(status)}
      </span>
      {screening?.recommendation && screening.recommendation !== "not_available" ? (
        <span className="inline-flex max-w-full items-center rounded-full bg-foreground/5 px-2.5 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
          {recommendationLabel(screening.recommendation)}
        </span>
      ) : null}
    </div>
  );
}

function CosignerSection({ applicationId }: { applicationId: string }) {
  const [subs, setSubs] = useState<CosignerSubmission[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchCosignerSubmissionsForSignerAppId(applicationId).then((rows) => {
      if (!cancelled) {
        setSubs(rows);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  if (!loaded) return null;
  if (subs.length === 0) return null;
  return (
    <div className="mt-6 space-y-6">
      {subs.map((cosub, i) => (
        <div key={i}>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">
            Co-signer on file{subs.length > 1 ? ` (${i + 1} of ${subs.length})` : ""}
          </p>
          <div className="mt-3">
            <ManagerCosignerReadonlyReview sub={cosub} primaryApplicationAxisId={applicationId} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ApplicantIds({ axisId }: { axisId: string }) {
  return (
    <div className="rounded-2xl border border-border bg-accent/30 p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Axis ID</p>
      <p className="mt-3 font-mono text-sm font-medium leading-relaxed text-foreground">{axisId}</p>
    </div>
  );
}

function ApplicationInfoCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm sm:py-[1.125rem]">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
      <div className="mt-2 text-sm font-semibold leading-snug text-foreground">{value}</div>
    </div>
  );
}

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

/** Server PDF endpoint for an application, with the client-resolved room label as a display hint. */
function applicationPdfHref(row: DemoApplicantRow, opts?: { inline?: boolean }): string {
  const roomChoice = row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "";
  const roomLabel = getRoomChoiceLabel(roomChoice);
  const params = new URLSearchParams();
  if (roomLabel) params.set("roomLabel", roomLabel);
  // Ask the route for an inline disposition so the browser renders (not downloads) the PDF in a preview frame.
  if (opts?.inline) params.set("disposition", "inline");
  const query = params.toString();
  return `/api/manager-applications/${encodeURIComponent(row.id)}/pdf${query ? `?${query}` : ""}`;
}

/** Trigger a browser download of the application PDF without opening a blank tab. */
function downloadApplicationPdf(row: DemoApplicantRow): void {
  const anchor = document.createElement("a");
  anchor.href = applicationPdfHref(row);
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Inline preview of the official application PDF, embedded via an authenticated same-origin
 * iframe so managers can read the document without downloading. The white PDF page reads
 * clearly on the themed card frame in both light and dark mode; a Download PDF action stays
 * available alongside it.
 */
function ApplicationPdfPreview({ row }: { row: DemoApplicantRow }) {
  const previewSrc = applicationPdfHref(row, { inline: true });
  return (
    <section className="mt-8 border-t border-border pt-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">Application document</p>
          <h4 className="mt-1.5 text-base font-semibold tracking-[-0.01em] text-foreground">Official application PDF</h4>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            Preview the branded application document below — the same file the Download PDF button produces.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className={PORTAL_DETAIL_BTN}
          data-attr="application-pdf-download"
          onClick={() => downloadApplicationPdf(row)}
        >
          Download PDF
        </Button>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-[#525659] shadow-sm">
        <iframe
          src={previewSrc}
          title="Application document preview"
          loading="lazy"
          className="h-[560px] w-full border-0 bg-white"
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

function stayTypeLabel(leaseTerm: string): string {
  if (!leaseTerm) return "Not set";
  if (leaseTerm === SHORT_TERM_LEASE_TERM) return "Short-Term Stay";
  if (leaseTerm === "Month-to-Month") return "Month-to-Month";
  if (leaseTerm === "Custom") return "Custom";
  return `${leaseTerm} lease`;
}

function moneyLabel(amount: number): string {
  return amount > 0 ? `$${amount.toFixed(2)}` : "None";
}

/**
 * Read-only placement summary for an approved application. All values are auto-filled from the
 * application and its listing — the captain's rule is "they should all be set, no need to edit."
 * These can only change later in the lease or payment portal, so this form shows them and lets the
 * manager confirm/sync them (which locks in the resident's charges) without free-text editing.
 */
function ManagerApplicationPlacementEditor({
  row,
  onSave,
}: {
  row: DemoApplicantRow;
  onSave: (
    propertyId: string,
    roomChoice: string,
    signedMonthlyRent: number,
    leaseTerm: string,
    leaseStart: string,
    leaseEnd: string,
    utilitiesOverride: string,
    securityDepositOverride: string,
    moveInFeeOverride: string,
    otherCostLabel: string,
    otherCostAmount: string,
  ) => void;
}) {
  const resolved = useMemo(() => resolvePlacementValuesForRow(row), [row]);

  const applicantChoices = [
    row.application?.roomChoice1?.trim(),
    row.application?.roomChoice2?.trim(),
    row.application?.roomChoice3?.trim(),
  ].filter(Boolean) as string[];

  const leaseEndLabel =
    resolved.leaseTerm === "Month-to-Month"
      ? "Month-to-month (no end date)"
      : resolved.leaseEnd
        ? formatLeaseDateLabel(resolved.leaseEnd)
        : "Not set";
  const leaseEndTitle = resolved.leaseTerm === SHORT_TERM_LEASE_TERM ? "Move-out date" : "Lease end";

  const canConfirm = resolved.missing.length === 0;

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Final placement</p>
          <h3 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-foreground">House, room, lease dates, and charges</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Auto-filled from the application and its listing. These drive the lease and resident charges — change them
            later in the lease or payment portal, not here.
          </p>
        </div>
        <span className="inline-flex w-fit shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold portal-badge-info ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
          Auto-filled from application
        </span>
      </div>

      {resolved.missing.length > 0 ? (
        <div className="mt-5 rounded-2xl border portal-banner-pending px-5 py-4 text-sm leading-relaxed">
          <span className="font-semibold">Not captured on the application yet:</span>{" "}
          {resolved.missing.join(", ")}. Add these to the listing or application, or set them later in the lease portal.
        </div>
      ) : null}

      <div className="mt-6 space-y-7">
        <section>
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-muted">Placement</p>
          <div className="grid gap-4 md:grid-cols-3">
            <ApplicationInfoCard label="House" value={resolved.propertyLabel || "Not set"} />
            <ApplicationInfoCard label="Room" value={resolved.roomLabel || "Not specified"} />
            <ApplicationInfoCard
              label="Signed monthly rent"
              value={resolved.signedMonthlyRent > 0 ? `$${resolved.signedMonthlyRent.toFixed(2)} / month` : "Not set"}
            />
          </div>
        </section>

        <section>
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-muted">Dates</p>
          <div className="grid gap-4 md:grid-cols-3">
            <ApplicationInfoCard label="Stay type" value={stayTypeLabel(resolved.leaseTerm)} />
            <ApplicationInfoCard
              label="Move-in date"
              value={resolved.leaseStart ? formatLeaseDateLabel(resolved.leaseStart) : "Not set"}
            />
            <ApplicationInfoCard label={leaseEndTitle} value={leaseEndLabel} />
          </div>
        </section>

        <section>
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-muted">Charges</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ApplicationInfoCard label="Utilities" value={moneyLabel(resolved.utilities)} />
            <ApplicationInfoCard label="Security deposit" value={moneyLabel(resolved.securityDeposit)} />
            <ApplicationInfoCard label="Move-in cost" value={moneyLabel(resolved.moveInFee)} />
            <ApplicationInfoCard
              label={resolved.otherCostLabel || "Other cost"}
              value={moneyLabel(resolved.otherCostAmount)}
            />
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-4 rounded-2xl bg-accent/30 p-5 text-sm text-muted lg:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Applicant room choices</p>
          <p className="mt-1.5 text-foreground">
            {applicantChoices.length
              ? applicantChoices.map((choice) => getRoomChoiceLabel(choice)).filter(Boolean).join(" · ")
              : "No room choices saved."}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Submitted lease timing</p>
          <p className="mt-1.5 text-foreground">
            {resolved.leaseStart
              ? `${formatLeaseDateLabel(resolved.leaseStart)}${
                  resolved.leaseEnd ? ` to ${formatLeaseDateLabel(resolved.leaseEnd)}` : ""
                }`
              : "No lease dates submitted."}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        <Button
          type="button"
          variant="outline"
          className={PORTAL_DETAIL_BTN_PRIMARY}
          disabled={!canConfirm}
          data-attr="application-placement-confirm"
          onClick={() =>
            onSave(
              resolved.propertyId,
              resolved.roomChoice,
              resolved.signedMonthlyRent,
              resolved.leaseTerm,
              resolved.leaseStart,
              resolved.leaseEnd,
              resolved.utilities > 0 ? String(resolved.utilities) : "",
              resolved.securityDeposit > 0 ? String(resolved.securityDeposit) : "",
              resolved.moveInFee > 0 ? String(resolved.moveInFee) : "",
              resolved.otherCostLabel,
              resolved.otherCostAmount > 0 ? String(resolved.otherCostAmount) : "",
            )
          }
        >
          Confirm placement
        </Button>
        {!canConfirm ? (
          <span className="text-xs text-muted">Complete the missing details above before confirming.</span>
        ) : null}
      </div>
    </div>
  );
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

  const savePlacement = useCallback(
    (
      id: string,
      propertyId: string,
      roomChoice: string,
      signedMonthlyRent: number,
      leaseTerm: string,
      leaseStart: string,
      leaseEnd: string,
      utilitiesOverride: string,
      securityDepositOverride: string,
      moveInFeeOverride: string,
      otherCostLabel: string,
      otherCostAmount: string,
    ) => {
      const property = getPropertyById(propertyId);
      const roomLabel = getRoomChoiceLabel(roomChoice);
      if (!property || !roomLabel || !(signedMonthlyRent > 0) || !leaseTerm || !leaseStart || (leaseTerm !== "Month-to-Month" && !leaseEnd)) {
        showToast("Select a valid house, room, rent, and tenancy dates.");
        return;
      }
      const rentalType: "short_term" | "standard" = leaseTerm === SHORT_TERM_LEASE_TERM ? "short_term" : "standard";
      const next = rows.map((row) =>
        row.id === id
          ? {
              ...row,
              managerUserId: row.managerUserId ?? userId ?? undefined,
              property: property.title?.trim() || row.property,
              propertyId,
              assignedPropertyId: propertyId,
              assignedRoomChoice: roomChoice,
              signedMonthlyRent: Number(signedMonthlyRent.toFixed(2)),
              stage: stageLabelForRow(row, row.bucket),
              application: row.application
                ? {
                    ...row.application,
                    propertyId,
                    roomChoice1: roomChoice,
                    rentalType,
                    leaseTerm,
                    leaseStart,
                    leaseEnd: leaseTerm === "Month-to-Month" ? "" : leaseEnd,
                    managerRentOverride: signedMonthlyRent > 0 ? String(Number(signedMonthlyRent.toFixed(2))) : "",
                    managerUtilitiesOverride: utilitiesOverride.trim(),
                    managerSecurityDepositOverride: securityDepositOverride.trim(),
                    managerMoveInFeeOverride: moveInFeeOverride.trim(),
                    managerOtherCostLabel: otherCostLabel.trim(),
                    managerOtherCostAmount: otherCostAmount.trim(),
                  }
                : row.application,
            }
          : row,
      );
      persist(next);
      const updatedRow = next.find((candidate) => candidate.id === id);
      if (updatedRow?.bucket === "approved") {
        recordApprovedApplicationCharges(updatedRow, userId ?? null);
      }
      showToast("Assigned house, room, stay type, and lease charges saved.");
    },
    [rows, persist, showToast, userId],
  );

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
                  <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN_PRIMARY} onClick={() => setApprovePreviewRow(row)}>
                    Approve
                  </Button>
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
                <div className="mt-3 border-t border-border pt-3 text-xs text-muted">
                  Application ID {row.id}
                </div>
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
                        <ApplicationBackgroundCheckStatusBadge row={row} />
                        <p className="mt-1.5 font-mono text-[10px] leading-relaxed tracking-wide text-muted">{row.id}</p>
                      </td>
                      <td className={`${PORTAL_TABLE_TD} align-middle leading-relaxed`}>{row.property}</td>
                      <td className={`${PORTAL_TABLE_TD} align-middle leading-relaxed`}>{displayRoomForRow(row)}</td>
                    </tr>
                    {expandedId === row.id ? (
                      <tr className={PORTAL_TABLE_DETAIL_ROW}>
                        <td colSpan={3} className={PORTAL_TABLE_DETAIL_CELL}>
                          <div className="mx-auto max-w-5xl space-y-8">
                          <PortalTableDetailActions placement="top">
                            {row.bucket === "pending" ? (
                              <>
                                <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN_PRIMARY} onClick={() => setApprovePreviewRow(row)}>
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

                          {row.application ? (
                            <div className="portal-desktop-scroll-panel overscroll-contain rounded-3xl border border-border bg-accent/40 p-5 shadow-[0_2px_20px_-12px_rgba(15,23,42,0.12)] sm:p-7">
                              <ManagerApplicationPlacementEditor
                                key={[
                                  row.id,
                                  row.assignedPropertyId,
                                  row.assignedRoomChoice,
                                  row.signedMonthlyRent,
                                  row.application?.rentalType,
                                  row.application?.leaseTerm,
                                  row.application?.leaseStart,
                                  row.application?.leaseEnd,
                                ].join("|")}
                                row={row}
                                onSave={(
                                  propertyId,
                                  roomChoice,
                                  signedMonthlyRent,
                                  leaseTerm,
                                  leaseStart,
                                  leaseEnd,
                                  utilitiesOverride,
                                  securityDepositOverride,
                                  moveInFeeOverride,
                                  otherCostLabel,
                                  otherCostAmount,
                                ) =>
                                  savePlacement(
                                    row.id,
                                    propertyId,
                                    roomChoice,
                                    signedMonthlyRent,
                                    leaseTerm,
                                    leaseStart,
                                    leaseEnd,
                                    utilitiesOverride,
                                    securityDepositOverride,
                                    moveInFeeOverride,
                                    otherCostLabel,
                                    otherCostAmount,
                                  )
                                }
                              />
                              <ApplicationPdfPreview row={row} />
                              <div className="mt-8 border-t border-border pt-8">
                              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">Application on file</p>
                              <div className="mt-4">
                                <ManagerApplicationReadonlyReview
                                  partial={{
                                    ...(effectiveApplicationForRow(row) ?? row.application),
                                    ...resolveApplicationPersonalFields(row),
                                  }}
                                  assignedPropertyId={row.assignedPropertyId}
                                  assignedRoomChoice={row.assignedRoomChoice}
                                />
                              </div>
                              <CosignerSection applicationId={row.id} />
                              </div>
                            </div>
                          ) : null}

                          <ApplicationScreeningPanel
                            row={row}
                            onUpdated={() => {
                              void syncManagerApplicationsFromServer({ managerUserId: userId }).then(setRows);
                            }}
                          />

                          <div className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
                          <ApplicantIds axisId={row.id} />

                          <p className="text-sm leading-relaxed text-muted">
                            <span className="font-medium text-foreground">Manager notes</span> — {row.detail}
                          </p>
                          </div>
                          </div>
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
