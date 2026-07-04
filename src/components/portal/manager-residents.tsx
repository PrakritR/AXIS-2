"use client";

import { isDemoModeActive } from "@/lib/demo/demo-session";
import Link from "next/link";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import { ChevronDown } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PortalNotificationPreviewModal } from "@/components/portal/portal-notification-preview-modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  MANAGER_TABLE_TH,
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
  PORTAL_FILTER_ACTIONS_MOBILE,
  PORTAL_HEADER_ACTION_BTN,
  PORTAL_PAGE_ACTIONS_DESKTOP,
} from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PORTAL_DETAIL_BTN_PRIMARY,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PortalTableDetailActions,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import { LeaseRegenerateConfirmModal } from "@/components/portal/lease-regenerate-confirm-modal";
import { LeaseSigningModal } from "@/components/portal/lease-signing-modal";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { usePaidPortalBasePath } from "@/lib/portal-base-path-client";
import {
  chargeDueLabel,
  HOUSEHOLD_CHARGES_EVENT,
  HOUSEHOLD_CHARGES_SESSION_KEY,
  markHouseholdChargePaid,
  markHouseholdChargePending,
  readChargesForManagerResident,
  recordApprovedApplicationCharges,
  removeResidentHouseholdPaymentData,
  syncHouseholdChargesFromServer,
  updatePendingRentAmountForResident,
  type HouseholdCharge,
} from "@/lib/household-charges";
import {
  appendManagerApplicationRow,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
  upsertApplicationRowToServer,
  writeManagerApplicationRows,
  MANAGER_APPLICATIONS_EVENT,
  normalizeApplicationAxisId,
} from "@/lib/manager-applications-storage";
import { applicationVisibleToPortalUser } from "@/lib/manager-portfolio-access";
import { isCurrentResidentApplicationRow } from "@/lib/current-resident";
import { getPropertyById, getRoomChoiceLabel, LISTING_ROOM_CHOICE_SEP } from "@/lib/rental-application/data";
import { normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import {
  buildMockPropertyFromDraft,
  PROPERTY_PIPELINE_EVENT,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";
import { deliverPortalInboxMessage } from "@/lib/portal-message-delivery";
import {
  appendLeaseThreadMessage,
  deleteLeasePipelineRow,
  deleteLeasePipelineRowsForResident,
  generateLeaseHtmlForRow,
  hasAnyLeaseSignature,
  leaseGenerationSupportedForRow,
  managerSignLease,
  leaseAllowsManagerDocumentEdits,
  LEASE_PIPELINE_EVENT,
  managerUploadLeasePdf,
  readLeasePipeline,
  residentCanViewLeaseRow,
  sendLeaseBackToManager,
  sendLeaseToResident,
  syncLeasePipelineFromServer,
  downloadLeaseFromRow,
  printLeaseAsPdf,
  hasBothLeaseSignatures,
  residentHasSignedLease,
  updateLeasePipelineRow,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";
import {
  MANAGER_WORK_ORDERS_EVENT,
  deleteManagerWorkOrdersForResident,
  readManagerWorkOrderRows,
  syncManagerWorkOrdersFromServer,
  updateManagerWorkOrder,
  deleteManagerWorkOrderRow,
} from "@/lib/manager-work-orders-storage";
import {
  SERVICE_REQUESTS_EVENT,
  readServiceRequestsForResident,
  readServiceRequestsForManager,
  hasDeposit,
  deleteServiceRequestsForResident,
  updateServiceRequest,
  deleteServiceRequest,
  type ServiceRequest,
} from "@/lib/service-requests-storage";
import type { DemoManagerWorkOrderRow, ResidentWorkBucket } from "@/data/demo-portal";
import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  invalidatePersistedInboxCache,
  loadPersistedInbox,
  MANAGER_INBOX_STORAGE_KEY,
  persistInbox,
  PORTAL_INBOX_CHANGED_EVENT,
  syncPersistedInboxFromServer,
  upsertPersistedInboxRows,
  deleteInboxThreadIds,
  type PersistedInboxThread,
} from "@/lib/portal-inbox-storage";
import {
  RESIDENT_WELCOME_EMAIL_SUBJECT,
  buildResidentWelcomeEmailBody,
  residentAccountCreationUrl,
} from "@/lib/resident-welcome-email";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PillTabs } from "@/components/ui/tabs";
import { ApplicationDocumentPreview, downloadApplicationPdf } from "@/components/portal/manager-applications";
import {
  INBOX_TAB_DEFS,
  PortalInboxEmptyState,
  PortalInboxMessageTable,
  type PortalInboxTableRow,
} from "@/components/portal/portal-inbox-ui";
import {
  REQUEST_STATUS_TABS,
  STATUS_TABS,
  ServiceRequestCard,
  ServiceStatusBadge,
  WorkOrderDetail,
  WorkOrderStatusBadge,
  formatDate as serviceRequestDateLabel,
  pillLabelWithCount,
  requestChargesSummary,
  unifiedItemStatusBucket,
  type RequestStatusBucket,
  type UnifiedItem,
} from "@/components/portal/resident-services-panel";
import { isHouseholdChargeOverdue } from "@/lib/household-charges";
import { ManagerInboxSchedulePanel } from "@/components/portal/manager-inbox-schedule-panel";
import { useScheduledPaymentMessages } from "@/components/portal/payment-schedule-ui";
import { isUpcomingScheduledInboxMessage, type ScheduledInboxMessageRecord } from "@/lib/scheduled-inbox-messages";

/**
 * Expanded-resident section: collapsed to a one-line summary by default; clicking the
 * header opens the full content (PDF preview, document, action buttons) inline.
 */
function ResidentDetailSection({
  title,
  summary,
  expanded,
  onToggle,
  headerAction,
  children,
}: {
  title: string;
  summary: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  /** Extra control (e.g. a button) rendered next to the toggle, outside the clickable header. */
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          data-attr="resident-section-toggle"
          className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 text-left"
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{title}</p>
            <p className="mt-1 text-sm text-muted">{summary}</p>
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>
      {expanded ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

type ActiveResident = {
  id: string;
  name: string;
  email: string;
  propertyId: string;
  propertyLabel: string;
  roomLabel: string;
  signedMonthlyRent: number | null;
  leaseStart: string;
  leaseEnd: string;
  axisId: string;
  manuallyAdded?: boolean;
  moveInInstructions?: string;
  manualResidentDetails?: NonNullable<import("@/data/demo-portal").DemoApplicantRow["manualResidentDetails"]>;
  isPrevious: boolean;
};

type ResidentsTabId = "current" | "previous";

function shortDateLabel(iso: string): string {
  const parts = iso.trim().split("-").map(Number);
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return iso;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

function isPreviousResidentRow(row: DemoApplicantRow): boolean {
  return !isCurrentResidentApplicationRow(row);
}

const AR_LEASE_TERM_CUSTOM = "__custom__";
const AR_LEASE_TERM_PRESETS = ["Month-to-month", "12 months", "6 months", "3 months"] as const;

function centsFromLabel(label: string): number {
  const n = Number(label.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function previewLine(body: string, max = 120) {
  const normalized = body.trim().replace(/\s+/g, " ");
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}…`;
}

export function ManagerResidents({ tabId = "current" }: { tabId?: ResidentsTabId }) {
  const { showToast } = useAppUi();
  const navigate = usePortalNavigate();
  const portalBase = usePaidPortalBasePath();
  const { userId, email: managerEmail, ready: authReady } = useManagerUserId();
  const [hcTick, setHcTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const [leaseTick, setLeaseTick] = useState(0);
  const [workOrderTick, setWorkOrderTick] = useState(0);
  const [srTick, setSrTick] = useState(0);
  const [inboxTick, setInboxTick] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [residentsTab, setResidentsTab] = useState<ResidentsTabId>(tabId);
  const [prevTabId, setPrevTabId] = useState(tabId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chargeTab, setChargeTab] = useState<"pending" | "paid">("pending");
  const [prevSelectedId, setPrevSelectedId] = useState<string | null>(null);
  const [residentAccountEmails, setResidentAccountEmails] = useState<Set<string>>(new Set());
  const [uploadingLeaseRowId, setUploadingLeaseRowId] = useState<string | null>(null);
  const [generatingLeaseRowId, setGeneratingLeaseRowId] = useState<string | null>(null);
  const [regenerateConfirmLeaseId, setRegenerateConfirmLeaseId] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [leaseReminderBusy, setLeaseReminderBusy] = useState(false);
  const [leaseReminderPreview, setLeaseReminderPreview] = useState<{
    res: ActiveResident;
    leaseId: string;
    recipient: string;
    subject: string;
    body: string;
  } | null>(null);
  const [leaseSentPreview, setLeaseSentPreview] = useState<{
    res: ActiveResident;
    lease: LeasePipelineRow;
    recipient: string;
    subject: string;
    body: string;
  } | null>(null);
  const [leaseSendBusy, setLeaseSendBusy] = useState(false);
  const [signingLease, setSigningLease] = useState<LeasePipelineRow | null>(null);
  const [welcomeEmailBusyForResident, setWelcomeEmailBusyForResident] = useState<string | null>(null);
  const [welcomePreviewFor, setWelcomePreviewFor] = useState<ActiveResident | null>(null);
  const [welcomePreviewContent, setWelcomePreviewContent] = useState("");

  // Services tab replica (Requests / Work orders — mirrors resident-services-panel.tsx)
  const [svcSubTab, setSvcSubTab] = useState<"requests" | "work-orders">("requests");
  const [svcRequestsFilter, setSvcRequestsFilter] = useState<RequestStatusBucket>("pending");
  const [svcWorkOrderBucket, setSvcWorkOrderBucket] = useState<ResidentWorkBucket>("open");
  const [svcExpandedId, setSvcExpandedId] = useState<string | null>(null);
  const [editingServiceRequest, setEditingServiceRequest] = useState<ServiceRequest | null>(null);
  const [srEditNotes, setSrEditNotes] = useState("");
  const [srEditReturnBy, setSrEditReturnBy] = useState("");
  const [editingWorkOrderRow, setEditingWorkOrderRow] = useState<DemoManagerWorkOrderRow | null>(null);
  const [woEditTitle, setWoEditTitle] = useState("");
  const [woEditPriority, setWoEditPriority] = useState("Medium");
  const [woEditArrival, setWoEditArrival] = useState("");
  const [woEditDetails, setWoEditDetails] = useState("");

  // Inbox tab replica (Unopened / Opened / Sent / Trash — mirrors resident-inbox-panel.tsx)
  const [inboxSubTab, setInboxSubTab] = useState<"unopened" | "opened" | "schedule" | "sent" | "trash">("unopened");
  const [inboxExpandedId, setInboxExpandedId] = useState<string | null>(null);

  // Expanded-resident detail: collapsed section summaries, opened one at a time on click
  const [expandedResidentSection, setExpandedResidentSection] = useState<
    "application" | "lease" | "payments" | "services" | "inbox" | null
  >(null);
  const [chargeExpandedId, setChargeExpandedId] = useState<string | null>(null);
  const [addPaymentMethodOpen, setAddPaymentMethodOpen] = useState(false);

  // Add resident manually
  const [addResidentOpen, setAddResidentOpen] = useState(false);
  const [arName, setArName] = useState("");
  const [arEmail, setArEmail] = useState("");
  const [arPropertyId, setArPropertyId] = useState("");
  const [arRoomId, setArRoomId] = useState("");
  const [arLeaseTerm, setArLeaseTerm] = useState("");
  const [arMoveInDate, setArMoveInDate] = useState("");
  const [arMoveOutDate, setArMoveOutDate] = useState("");
  const [arRent, setArRent] = useState("");
  const [arUtilities, setArUtilities] = useState("");
  const [arMoveInFee, setArMoveInFee] = useState("");
  const [arSecurityDeposit, setArSecurityDeposit] = useState("");
  const [arNotes, setArNotes] = useState("");

  // Edit resident
  const [editResidentOpen, setEditResidentOpen] = useState(false);
  const [erName, setErName] = useState("");
  const [erEmail, setErEmail] = useState("");
  const [erPropertyId, setErPropertyId] = useState("");
  const [erRoomId, setErRoomId] = useState("");
  const [erLeaseTerm, setErLeaseTerm] = useState("");
  const [erMoveInDate, setErMoveInDate] = useState("");
  const [erMoveOutDate, setErMoveOutDate] = useState("");
  const [erRent, setErRent] = useState("");
  const [erUtilities, setErUtilities] = useState("");
  const [erMoveInFee, setErMoveInFee] = useState("");
  const [erSecurityDeposit, setErSecurityDeposit] = useState("");
  const [erNotes, setErNotes] = useState("");

  if (tabId !== prevTabId) {
    setPrevTabId(tabId);
    if (residentsTab !== tabId) setResidentsTab(tabId);
  }

  useEffect(() => {
    const on = () => setHcTick((n) => n + 1);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, on);
    const onStorage = (e: StorageEvent) => {
      if (e.key === HOUSEHOLD_CHARGES_SESSION_KEY) on();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, on);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    const onLease = () => setLeaseTick((n) => n + 1);
    const onWorkOrder = () => setWorkOrderTick((n) => n + 1);
    const onSr = () => setSrTick((n) => n + 1);
    const onInbox = (evt?: Event) => {
      if (evt && evt.type === PORTAL_INBOX_CHANGED_EVENT) {
        const detail = (evt as CustomEvent<{ key?: string }>).detail;
        if (detail?.key && detail.key !== MANAGER_INBOX_STORAGE_KEY) return;
      }
      setInboxTick((n) => n + 1);
    };
    window.addEventListener(LEASE_PIPELINE_EVENT, onLease);
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, onWorkOrder);
    window.addEventListener(SERVICE_REQUESTS_EVENT, onSr);
    window.addEventListener(PORTAL_INBOX_CHANGED_EVENT, onInbox as EventListener);
    return () => {
      window.removeEventListener(LEASE_PIPELINE_EVENT, onLease);
      window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, onWorkOrder);
      window.removeEventListener(SERVICE_REQUESTS_EVENT, onSr);
      window.removeEventListener(PORTAL_INBOX_CHANGED_EVENT, onInbox as EventListener);
    };
  }, []);

  useEffect(() => {
    const bump = () => setPropertyTick((n) => n + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  useEffect(() => {
    if (!authReady || !userId) return;
    let cancelled = false;
    void Promise.allSettled([
      syncPropertyPipelineFromServer(),
      syncManagerApplicationsFromServer({ managerUserId: userId }),
      syncLeasePipelineFromServer(userId),
      syncManagerWorkOrdersFromServer(),
      syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY),
      syncHouseholdChargesFromServer(),
    ]).then(() => {
      if (!cancelled) {
        setPropertyTick((n) => n + 1);
        setInboxTick((n) => n + 1);
        setWorkOrderTick((n) => n + 1);
        setHcTick((n) => n + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authReady, userId]);

  useEffect(() => {
    const emails = [
      ...new Set(
        readManagerApplicationRows()
          .filter(
            (row) =>
              row.bucket === "approved" &&
              row.email?.trim() &&
              applicationVisibleToPortalUser(row, userId),
          )
          .map((row) => row.email!.trim().toLowerCase()),
      ),
    ];
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      if (emails.length === 0) {
        setResidentAccountEmails(new Set());
        return;
      }
      // Demo sandbox: every demo resident already has an Axis account with
      // their portal set up — no "no Axis account yet" badges.
      if (isDemoModeActive()) {
        setResidentAccountEmails(new Set(emails));
        return;
      }
      const opts = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails }) };
      const accountRes = await fetch("/api/manager/resident-account-emails", opts);
      if (cancelled) return;
      if (accountRes.ok) {
        const body = (await accountRes.json()) as { emails?: string[] };
        if (!cancelled) setResidentAccountEmails(new Set((body.emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean)));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, hcTick, propertyTick]);

  // Silently purge server-side orphaned records for deleted residents on mount.
  useEffect(() => {
    if (!authReady || !userId || isDemoModeActive()) return;
    let cancelled = false;
    void fetch("/api/portal/purge-orphaned-records", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "current_only" }),
    })
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { deleted?: Record<string, number>; purgedEmails?: string[] };
        const total = Object.values(body.deleted ?? {}).reduce((a, b) => a + b, 0);
        if (total === 0) return;
        await syncManagerApplicationsFromServer({ force: true, managerUserId: userId });
        void syncHouseholdChargesFromServer(true).then(() => { if (!cancelled) setHcTick((n) => n + 1); });
        void syncLeasePipelineFromServer(userId, { force: true }).then(() => { if (!cancelled) setLeaseTick((n) => n + 1); });
        void syncManagerWorkOrdersFromServer({ force: true }).then(() => { if (!cancelled) setWorkOrderTick((n) => n + 1); });
        void syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY, { force: true }).then(() => { if (!cancelled) setInboxTick((n) => n + 1); });
        const activeEmails = new Set(
          readManagerApplicationRows()
            .filter((row) => row.bucket === "approved" && !isPreviousResidentRow(row))
            .map((r) => r.email?.trim().toLowerCase())
            .filter((e): e is string => Boolean(e)),
        );
        const purgedEmails = (body.purgedEmails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean);
        const purgedEmailSet = new Set(purgedEmails);
        for (const sr of readServiceRequestsForManager(userId)) {
          if (!activeEmails.has(sr.residentEmail.trim().toLowerCase())) {
            deleteServiceRequestsForResident(sr.residentEmail);
          }
        }
        for (const email of purgedEmailSet) {
          removeResidentHouseholdPaymentData(email);
          deleteManagerWorkOrdersForResident(email);
          deleteLeasePipelineRowsForResident(email, undefined, userId);
          deleteServiceRequestsForResident(email);
        }
        const inboxRows = loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []);
        const filteredInbox = inboxRows.filter((thread) => {
          const participant = thread.email?.trim().toLowerCase() || "";
          return participant ? !purgedEmailSet.has(participant) : true;
        });
        if (filteredInbox.length !== inboxRows.length) {
          persistInbox(MANAGER_INBOX_STORAGE_KEY, filteredInbox);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authReady, userId]);

  const residents = useMemo<ActiveResident[]>(() => {
    void hcTick;
    return readManagerApplicationRows()
      .filter((row) => row.bucket === "approved" && applicationVisibleToPortalUser(row, userId))
      .map((row) => {
        const propId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || "";
        const prop = propId ? getPropertyById(propId) : null;
        const roomLabel =
          row.manualResidentDetails?.roomNumber?.trim() ||
          getRoomChoiceLabel(row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "").split(" · ")[0]?.trim() ||
          "";
        const propertyLabel = (prop?.buildingName?.trim() || prop?.title?.trim()?.replace(/\s*·\s*\d+\s*rooms?\s*$/i, "") || row.property || "").trim();
        const leaseStart = (row.application?.leaseStart?.trim() || row.manualResidentDetails?.moveInDate?.trim() || "");
        const leaseEnd = (row.application?.leaseEnd?.trim() || row.manualResidentDetails?.moveOutDate?.trim() || "");
        return {
          id: row.id,
          name: row.name,
          email: (row.email ?? "").trim(),
          propertyId: propId,
          propertyLabel,
          roomLabel,
          signedMonthlyRent: row.signedMonthlyRent ?? null,
          leaseStart,
          leaseEnd,
          axisId: normalizeApplicationAxisId(row.id),
          manuallyAdded: row.manuallyAdded,
          moveInInstructions: row.moveInInstructions,
          manualResidentDetails: row.manualResidentDetails,
          isPrevious: isPreviousResidentRow(row),
        };
      });
  }, [userId, hcTick]);

  const propertyOptions = useMemo(() => {
    void propertyTick;
    const labelById = new Map<string, string>();
    if (userId) {
      for (const p of readExtraListingsForUser(userId)) {
        labelById.set(p.id, (p.buildingName || p.title?.replace(/\s*·\s*\d+\s*rooms?\s*$/i, "") || p.address || p.id).trim());
      }
      for (const p of readPendingManagerPropertiesForUser(userId)) {
        const built = buildMockPropertyFromDraft(p, p.id);
        const label = [built.buildingName, built.address].filter(Boolean).join(" · ").trim() || built.title;
        labelById.set(p.id, label);
      }
    }
    for (const r of residents) {
      if (r.propertyId && !labelById.has(r.propertyId)) {
        labelById.set(r.propertyId, r.propertyLabel || r.propertyId);
      }
    }
    return [...labelById.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [residents, userId, propertyTick]);

  const arRoomOptions = useMemo(() => {
    void propertyTick;
    if (!arPropertyId || !userId) return [];
    const listing = readExtraListingsForUser(userId).find((p) => p.id === arPropertyId);
    if (!listing?.listingSubmission) return [];
    const sub = normalizeManagerListingSubmissionV1(listing.listingSubmission);
    return sub.rooms.map((r) => ({ id: r.id, name: r.name || r.id, monthlyRent: r.monthlyRent }));
  }, [arPropertyId, userId, propertyTick]);

  const erRoomOptions = useMemo(() => {
    void propertyTick;
    if (!erPropertyId || !userId) return [];
    const listing = readExtraListingsForUser(userId).find((p) => p.id === erPropertyId);
    if (!listing?.listingSubmission) return [];
    const sub = normalizeManagerListingSubmissionV1(listing.listingSubmission);
    return sub.rooms.map((r) => ({ id: r.id, name: r.name || r.id, monthlyRent: r.monthlyRent }));
  }, [erPropertyId, userId, propertyTick]);

  const arLeaseTermSelectValue = useMemo(() => {
    if (!arLeaseTerm.trim()) return "";
    return AR_LEASE_TERM_PRESETS.includes(arLeaseTerm as (typeof AR_LEASE_TERM_PRESETS)[number])
      ? arLeaseTerm
      : AR_LEASE_TERM_CUSTOM;
  }, [arLeaseTerm]);

  const isMonthToMonthLease = arLeaseTerm === "Month-to-month";

  const erLeaseTermSelectValue = useMemo(() => {
    if (!erLeaseTerm.trim()) return "";
    return AR_LEASE_TERM_PRESETS.includes(erLeaseTerm as (typeof AR_LEASE_TERM_PRESETS)[number])
      ? erLeaseTerm
      : AR_LEASE_TERM_CUSTOM;
  }, [erLeaseTerm]);

  const isEditMonthToMonthLease = erLeaseTerm === "Month-to-month";

  if (isMonthToMonthLease && arMoveOutDate) {
    setArMoveOutDate("");
  }

  if (isEditMonthToMonthLease && erMoveOutDate) {
    setErMoveOutDate("");
  }

  const filtered = useMemo(() => {
    const inTab = residents.filter((resident) => (residentsTab === "current" ? !resident.isPrevious : resident.isPrevious));
    const base = propertyFilter
      ? inTab.filter((r) => r.propertyId === propertyFilter)
      : inTab;

    return [...base].sort((a, b) => {
      if (!propertyFilter) {
        const propCmp = a.propertyLabel.localeCompare(b.propertyLabel, undefined, { sensitivity: "base" });
        if (propCmp !== 0) return propCmp;
      }

      const nameCmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (nameCmp !== 0) return nameCmp;

      const aNum = parseInt(a.roomLabel.match(/\d+/)?.[0] ?? "0", 10);
      const bNum = parseInt(b.roomLabel.match(/\d+/)?.[0] ?? "0", 10);
      return aNum - bNum;
    });
  }, [residents, residentsTab, propertyFilter]);

  const currentResidentsCount = useMemo(() => residents.filter((resident) => !resident.isPrevious).length, [residents]);
  const previousResidentsCount = useMemo(() => residents.filter((resident) => resident.isPrevious).length, [residents]);

  const selected = useMemo(() => residents.find((r) => r.id === selectedId) ?? null, [residents, selectedId]);

  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    if (selectedId) {
      setChargeTab("pending");
      setSvcSubTab("requests");
      setSvcRequestsFilter("pending");
      setSvcWorkOrderBucket("open");
      setSvcExpandedId(null);
      setInboxSubTab("unopened");
      setInboxExpandedId(null);
      setExpandedResidentSection(null);
      setChargeExpandedId(null);
    }
  }

  if (selectedId && !filtered.some((resident) => resident.id === selectedId)) {
    setSelectedId(null);
  }

  const residentCharges = useMemo<HouseholdCharge[]>(() => {
    void hcTick;
    if (!selected?.email) return [];
    return readChargesForManagerResident(selected.email, userId ?? null);
  }, [selected, hcTick, userId]);

  const residentLease = useMemo<LeasePipelineRow | null>(() => {
    void leaseTick;
    if (!selected?.email) return null;
    const selectedAxisId = normalizeApplicationAxisId(selected.id);
    const email = selected.email.trim().toLowerCase();
    const allRows = readLeasePipeline(userId);
    const rows = allRows.filter((row) => {
      const rowAxisId = row.axisId?.trim() ? normalizeApplicationAxisId(row.axisId) : "";
      if (rowAxisId && rowAxisId === selectedAxisId) return true;
      return row.residentEmail.trim().toLowerCase() === email;
    });
    rows.sort((a, b) => {
      const aAxisMatch = (a.axisId?.trim() ? normalizeApplicationAxisId(a.axisId) : "") === selectedAxisId;
      const bAxisMatch = (b.axisId?.trim() ? normalizeApplicationAxisId(b.axisId) : "") === selectedAxisId;
      const axisDelta = Number(bAxisMatch) - Number(aAxisMatch);
      if (axisDelta !== 0) return axisDelta;

      const visibleDelta = Number(residentCanViewLeaseRow(b)) - Number(residentCanViewLeaseRow(a));
      if (visibleDelta !== 0) return visibleDelta;
      const rank = (row: LeasePipelineRow) => {
        switch (row.status) {
          case "Fully Signed":
            return 5;
          case "Manager Signature Pending":
            return 4;
          case "Resident Signature Pending":
            return 3;
          case "Manager Review":
            return 2;
          case "Admin Review":
            return 1;
          default:
            return 0;
        }
      };
      const rankDelta = rank(b) - rank(a);
      if (rankDelta !== 0) return rankDelta;
      const aTs = Date.parse(a.updatedAtIso || "");
      const bTs = Date.parse(b.updatedAtIso || "");
      return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
    });
    return rows[0] ?? null;
  }, [leaseTick, selected, userId]);

  const residentWorkOrders = useMemo(() => {
    void workOrderTick;
    if (!selected?.email) return [];
    const email = selected.email.trim().toLowerCase();
    return readManagerWorkOrderRows()
      .filter((row) => row.residentEmail?.trim().toLowerCase() === email)
      .sort((a, b) => {
        const bucketOrder = { open: 0, scheduled: 1, completed: 2 } as const;
        const cmp = bucketOrder[a.bucket] - bucketOrder[b.bucket];
        if (cmp !== 0) return cmp;
        return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      });
  }, [selected, workOrderTick]);

  const residentServiceRequests = useMemo<ServiceRequest[]>(() => {
    void srTick;
    if (!selected?.email) return [];
    // All statuses — manager sees pending (to approve/deny), approved, returned, denied
    return readServiceRequestsForResident(selected.email).sort((a, b) => {
      const order = { pending: 0, approved: 1, returned: 2, denied: 3 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });
  }, [selected, srTick]);

  const residentInboxThreads = useMemo<PersistedInboxThread[]>(() => {
    void inboxTick;
    if (!selected?.email) return [];
    const email = selected.email.trim().toLowerCase();
    return loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, [])
      .filter((thread) => thread.email.trim().toLowerCase() === email)
      .sort((a, b) => String(b.time).localeCompare(String(a.time)));
  }, [selected, inboxTick]);

  const chargeCounts = useMemo(
    () => ({
      pending: residentCharges.filter((c) => c.status === "pending").length,
      paid: residentCharges.filter((c) => c.status === "paid").length,
    }),
    [residentCharges],
  );

  const visibleCharges = useMemo(
    () => residentCharges.filter((c) => c.status === chargeTab),
    [residentCharges, chargeTab],
  );

  const pendingBalance = useMemo(
    () =>
      residentCharges
        .filter((c) => c.status === "pending")
        .reduce((sum, c) => sum + centsFromLabel(c.balanceLabel), 0),
    [residentCharges],
  );

  const overdueChargeCount = useMemo(
    () => residentCharges.filter((c) => c.status === "pending" && isHouseholdChargeOverdue(c)).length,
    [residentCharges],
  );

  const selectedApplicationRow = useMemo<DemoApplicantRow | null>(() => {
    void hcTick;
    if (!selected) return null;
    return readManagerApplicationRows().find((row) => row.id === selected.id) ?? null;
  }, [selected, hcTick]);

  const residentUnifiedServiceItems = useMemo<UnifiedItem[]>(() => {
    const items: UnifiedItem[] = [];
    for (const req of residentServiceRequests) {
      const t = new Date(req.requestedAt).getTime();
      items.push({ kind: "request", req, sortKey: Number.isFinite(t) ? t : 0 });
    }
    for (const row of residentWorkOrders) {
      const fromId = Number(row.id.replace(/^\D*/, ""));
      const fromSchedule = row.scheduledAtIso ? new Date(row.scheduledAtIso).getTime() : 0;
      const t = Number.isFinite(fromId) && fromId > 0 ? fromId : fromSchedule;
      items.push({ kind: "work-order", row, sortKey: Number.isFinite(t) ? t : 0 });
    }
    items.sort((a, b) => b.sortKey - a.sortKey);
    return items;
  }, [residentServiceRequests, residentWorkOrders]);

  const residentServiceRequestsCounts = useMemo(() => {
    const c: Record<RequestStatusBucket, number> = { pending: 0, approved: 0, completed: 0 };
    for (const item of residentUnifiedServiceItems) c[unifiedItemStatusBucket(item)] += 1;
    return c;
  }, [residentUnifiedServiceItems]);

  const residentFilteredUnifiedServiceItems = useMemo(
    () => residentUnifiedServiceItems.filter((item) => unifiedItemStatusBucket(item) === svcRequestsFilter),
    [residentUnifiedServiceItems, svcRequestsFilter],
  );

  const residentWorkOrderBucketCounts = useMemo(() => {
    const c: Record<ResidentWorkBucket, number> = { open: 0, scheduled: 0, completed: 0 };
    for (const row of residentWorkOrders) c[row.bucket] += 1;
    return c;
  }, [residentWorkOrders]);

  const residentWorkOrdersInBucket = useMemo(
    () => residentWorkOrders.filter((row) => row.bucket === svcWorkOrderBucket),
    [residentWorkOrders, svcWorkOrderBucket],
  );

  // Scheduled-message count for this resident's Inbox → Schedule tab (mirrors manager-inbox.tsx's scheduleCount).
  const { messages: residentScheduledAutomationMessages } = useScheduledPaymentMessages({ includeHidden: false });
  const [residentManualScheduledMessages, setResidentManualScheduledMessages] = useState<ScheduledInboxMessageRecord[]>([]);

  useEffect(() => {
    if (isDemoModeActive()) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/portal/scheduled-inbox-messages", { credentials: "include", cache: "no-store" });
      if (!res.ok || cancelled) return;
      const body = (await res.json()) as { messages?: ScheduledInboxMessageRecord[] };
      setResidentManualScheduledMessages(Array.isArray(body.messages) ? body.messages : []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const residentScheduleCount = useMemo(() => {
    const targetEmail = selected?.email?.trim().toLowerCase();
    if (!targetEmail) return 0;
    const upcoming = (status: string, sendAt: string) =>
      status === "scheduled" && isUpcomingScheduledInboxMessage(sendAt, status);
    return (
      residentManualScheduledMessages.filter(
        (m) => upcoming(m.status, m.sendAt) && m.recipientEmail?.trim().toLowerCase() === targetEmail,
      ).length +
      residentScheduledAutomationMessages.filter(
        (m) => upcoming(m.status, m.sendAt) && m.residentEmail?.trim().toLowerCase() === targetEmail,
      ).length
    );
  }, [residentManualScheduledMessages, residentScheduledAutomationMessages, selected]);

  const residentInboxCounts = useMemo(
    () => ({
      unopened: residentInboxThreads.filter((t) => t.folder === "inbox" && t.unread).length,
      opened: residentInboxThreads.filter((t) => t.folder === "inbox" && !t.unread).length,
      schedule: residentScheduleCount,
      sent: residentInboxThreads.filter((t) => t.folder === "sent").length,
      trash: residentInboxThreads.filter((t) => t.folder === "trash").length,
    }),
    [residentInboxThreads, residentScheduleCount],
  );

  const residentInboxRowsForTab = useMemo(
    () =>
      residentInboxThreads.filter((t) => {
        if (inboxSubTab === "unopened") return t.folder === "inbox" && t.unread;
        if (inboxSubTab === "opened") return t.folder === "inbox" && !t.unread;
        if (inboxSubTab === "sent") return t.folder === "sent";
        return t.folder === "trash";
      }),
    [residentInboxThreads, inboxSubTab],
  );

  const residentInboxTableRows = useMemo<PortalInboxTableRow[]>(
    () =>
      residentInboxRowsForTab.map((t) => ({
        id: t.id,
        name: inboxSubTab === "sent" ? t.email || "Unknown recipient" : t.from,
        email: inboxSubTab === "sent" ? (t.from ? `From ${t.from}` : "") : t.email,
        topic: t.subject,
        preview: t.preview,
        whenLabel: t.time,
        read: !t.unread,
      })),
    [residentInboxRowsForTab, inboxSubTab],
  );

  const residentInboxBodyById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of residentInboxThreads) m[t.id] = t.body;
    return m;
  }, [residentInboxThreads]);


  async function sendResidentMessage() {
    if (!selected) return;
    const subject = messageSubject.trim();
    const body = messageBody.trim();
    if (!subject || !body) {
      showToast("Add a subject and message.");
      return;
    }
    setMessageSubject("");
    setMessageBody("");
    setMessageOpen(false);
    const result = await deliverPortalInboxMessage({
      fromName: managerEmail ?? "Property Manager",
      toEmails: [selected.email],
      subject,
      text: body,
    });
    if (!result.ok) {
      showToast(result.error ?? "Message could not be sent.");
      return;
    }
    invalidatePersistedInboxCache(MANAGER_INBOX_STORAGE_KEY);
    const fresh = await syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY, { force: true });
    persistInbox(MANAGER_INBOX_STORAGE_KEY, fresh as PersistedInboxThread[]);
    setInboxTick((n) => n + 1);
    showToast(result.skipped ? "Message sent to inbox (demo email skipped)." : "Message sent via inbox and email.");
  }

  function openServiceRequestEdit(req: ServiceRequest) {
    setEditingServiceRequest(req);
    setSrEditNotes(req.notes);
    setSrEditReturnBy(req.returnByDate);
  }

  function saveServiceRequestEdit() {
    if (!editingServiceRequest) return;
    if (hasDeposit(editingServiceRequest.deposit) && !srEditReturnBy.trim()) {
      showToast("Please enter a return-by date.");
      return;
    }
    updateServiceRequest(editingServiceRequest.id, {
      notes: srEditNotes.trim(),
      returnByDate: srEditReturnBy.trim(),
    });
    setEditingServiceRequest(null);
    setSrTick((n) => n + 1);
    showToast("Request updated.");
  }

  function deleteResidentServiceRequest(id: string) {
    if (!window.confirm("Delete this service request? This cannot be undone.")) return;
    deleteServiceRequest(id);
    setSrTick((n) => n + 1);
    setSvcExpandedId(null);
    showToast("Request deleted.");
  }

  function openWorkOrderRowEdit(row: DemoManagerWorkOrderRow) {
    setEditingWorkOrderRow(row);
    setWoEditTitle(row.title);
    setWoEditPriority(row.priority || "Medium");
    setWoEditArrival(row.preferredArrival && row.preferredArrival !== "Anytime" ? row.preferredArrival : "");
    setWoEditDetails(row.description);
  }

  function saveWorkOrderRowEdit() {
    if (!editingWorkOrderRow) return;
    if (!woEditTitle.trim()) {
      showToast("Add a title first.");
      return;
    }
    updateManagerWorkOrder(editingWorkOrderRow.id, (r) => ({
      ...r,
      title: woEditTitle.trim(),
      priority: woEditPriority,
      preferredArrival: woEditArrival.trim() || "Anytime",
      description: woEditDetails.trim() || r.description,
    }));
    setEditingWorkOrderRow(null);
    setWorkOrderTick((n) => n + 1);
    showToast("Work order updated.");
  }

  function cancelResidentWorkOrder(id: string) {
    if (!window.confirm("Cancel this work order? This cannot be undone.")) return;
    deleteManagerWorkOrderRow(id);
    setWorkOrderTick((n) => n + 1);
    setSvcExpandedId(null);
    showToast("Work order removed.");
  }

  function markResidentInboxThreadRead(id: string) {
    const all = loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []) as PersistedInboxThread[];
    const target = all.find((t) => t.id === id);
    if (!target || target.folder !== "inbox") return;
    const updated: PersistedInboxThread = { ...target, unread: false };
    const next = all.map((t) => (t.id === id ? updated : t));
    persistInbox(MANAGER_INBOX_STORAGE_KEY, next);
    setInboxTick((n) => n + 1);
    void upsertPersistedInboxRows(MANAGER_INBOX_STORAGE_KEY, [updated], next);
    showToast("Marked as read.");
  }

  function markResidentInboxThreadUnread(id: string) {
    const all = loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []) as PersistedInboxThread[];
    const target = all.find((t) => t.id === id);
    if (!target || target.folder !== "inbox") return;
    const updated: PersistedInboxThread = { ...target, unread: true };
    const next = all.map((t) => (t.id === id ? updated : t));
    persistInbox(MANAGER_INBOX_STORAGE_KEY, next);
    setInboxTick((n) => n + 1);
    void upsertPersistedInboxRows(MANAGER_INBOX_STORAGE_KEY, [updated], next);
    showToast("Marked as unread.");
  }

  function moveResidentInboxThreadToTrash(id: string) {
    const all = loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []) as PersistedInboxThread[];
    const target = all.find((t) => t.id === id);
    if (!target || target.folder === "trash") return;
    const updated: PersistedInboxThread = { ...target, folder: "trash", previousFolder: target.folder, unread: false };
    const next = all.map((t) => (t.id === id ? updated : t));
    persistInbox(MANAGER_INBOX_STORAGE_KEY, next);
    setInboxTick((n) => n + 1);
    setInboxExpandedId(null);
    void upsertPersistedInboxRows(MANAGER_INBOX_STORAGE_KEY, [updated], next).then((ok) => {
      showToast(ok ? "Moved to trash." : "Could not move message to trash.");
    });
  }

  function restoreResidentInboxThreadFromTrash(id: string) {
    const all = loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []) as PersistedInboxThread[];
    const target = all.find((t) => t.id === id && t.folder === "trash");
    if (!target) return;
    const dest = target.previousFolder ?? "inbox";
    const updated: PersistedInboxThread = { ...target, folder: dest, previousFolder: undefined };
    const next = all.map((t) => (t.id === id ? updated : t));
    persistInbox(MANAGER_INBOX_STORAGE_KEY, next);
    setInboxTick((n) => n + 1);
    setInboxExpandedId(null);
    void upsertPersistedInboxRows(MANAGER_INBOX_STORAGE_KEY, [updated], next).then((ok) => {
      showToast(ok ? "Restored." : "Could not restore message.");
    });
  }

  function deleteResidentInboxThreadForever(id: string) {
    void (async () => {
      invalidatePersistedInboxCache(MANAGER_INBOX_STORAGE_KEY);
      const ok = await deleteInboxThreadIds([id]);
      if (!ok) {
        showToast("Could not delete message.");
        return;
      }
      const all = loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []) as PersistedInboxThread[];
      const next = all.filter((t) => t.id !== id);
      persistInbox(MANAGER_INBOX_STORAGE_KEY, next);
      setInboxTick((n) => n + 1);
      setInboxExpandedId(null);
      showToast("Deleted permanently.");
    })();
  }

  async function replyToResidentInboxThread(thread: PersistedInboxThread, text: string) {
    if (!selected) return;
    const subject = thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`;
    const result = await deliverPortalInboxMessage({
      fromName: managerEmail ?? "Property Manager",
      toEmails: [selected.email],
      subject,
      text,
    });
    if (!result.ok) {
      throw new Error(result.error ?? "Message could not be sent.");
    }
    invalidatePersistedInboxCache(MANAGER_INBOX_STORAGE_KEY);
    const fresh = await syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY, { force: true });
    persistInbox(MANAGER_INBOX_STORAGE_KEY, fresh as PersistedInboxThread[]);
    setInboxTick((n) => n + 1);
  }

  async function sendResidentAccountEmail(res: ActiveResident) {
    setWelcomeEmailBusyForResident(res.id);
    try {
      const response = await fetch("/api/portal/send-resident-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to: res.email, residentName: res.name, axisId: res.axisId }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; mailtoHref?: string };
      if (response.ok && data.ok) {
        showToast("Account setup email sent.");
        return;
      }
      if (typeof data.mailtoHref === "string") {
        const { openMailtoHref } = await import("@/lib/resident-welcome-email");
        openMailtoHref(data.mailtoHref);
        const err = (data.error ?? "").toLowerCase();
        showToast(
          err.includes("not configured") || err.includes("resend_api_key")
            ? "Email provider not configured — opened a draft in your mail app."
            : `Could not send automatically — opened a draft in your mail app.`,
        );
        return;
      }
      showToast(data.error ?? "Could not send account setup email.");
    } catch {
      showToast("Could not send account setup email.");
    } finally {
      setWelcomeEmailBusyForResident(null);
    }
  }

  async function sendLeaseSigningReminder(res: ActiveResident, leaseId: string, subject: string, body: string) {
    setLeaseReminderBusy(true);
    try {
      const response = await fetch("/api/portal/send-inbox-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fromName: managerEmail ?? "Property Manager",
          toEmails: [res.email],
          subject,
          text: body,
          deliverToPortalInbox: true,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; skipped?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        showToast(data.error ?? "Could not send lease signing reminder.");
        return;
      }

      appendLeaseThreadMessage(leaseId, "manager", "Sent lease-signing reminder to resident.", userId);
      setLeaseTick((n) => n + 1);
      if (data.skipped) {
        showToast("Reminder sent to Axis inbox (demo email, no external email sent).");
      } else {
        showToast("Lease-signing reminder sent via email and Axis inbox.");
      }
    } catch {
      showToast("Could not send lease signing reminder.");
    } finally {
      setLeaseReminderBusy(false);
    }
  }

  function openLeaseSigningReminderPreview(res: ActiveResident, lease: LeasePipelineRow) {
    const recipient = res.email.trim();
    if (!recipient || !recipient.includes("@")) {
      showToast("Resident email is missing or invalid.");
      return;
    }
    const unit = lease.unit.trim() || "your unit";
    const leaseStart = lease.application?.leaseStart?.trim();
    const leaseEnd = lease.application?.leaseEnd?.trim();
    const dateLine = leaseStart
      ? leaseEnd
        ? `Lease dates: ${leaseStart} to ${leaseEnd}`
        : `Lease start date: ${leaseStart}`
      : "";
    const subject = `Reminder: sign your lease for ${unit}`;
    const body = [
      `Hi ${res.name.split(" ")[0] ?? res.name},`,
      "",
      `This is a reminder to review and sign your lease for ${unit} in your Axis resident portal.`,
      dateLine,
      "",
      "If you have any questions before signing, reply in your Axis inbox and we will help.",
      "",
      "Axis",
    ].filter(Boolean).join("\n");

    setLeaseReminderPreview({
      res,
      leaseId: lease.id,
      recipient,
      subject,
      body,
    });
  }

  function leaseSentToResidentBody(res: ActiveResident, lease: LeasePipelineRow): string {
    const unit = lease.unit.trim() || "your unit";
    return [
      `Hi ${lease.residentName || res.name || "there"},`,
      "",
      `Your lease for ${unit} is ready to review and sign in your Axis resident portal.`,
      "",
      "Sign in to Axis, open Leases in the sidebar, and complete your signature when you're ready.",
      "",
      "If you have any questions before signing, reply in your Axis inbox and we will help.",
      "",
      "Axis",
    ].join("\n");
  }

  function openLeaseSendPreview(res: ActiveResident, lease: LeasePipelineRow) {
    if (!residentAccountEmails.has(res.email.trim().toLowerCase())) {
      showToast("Resident must create their account before the lease can be sent.");
      return;
    }
    if (!lease.generatedHtml && !lease.managerUploadedPdf?.dataUrl) {
      showToast("Generate or upload a lease document first.");
      return;
    }
    const recipient = res.email.trim();
    const unit = lease.unit.trim() || "your unit";
    setLeaseSentPreview({
      res,
      lease,
      recipient,
      subject: `Your lease for ${unit} is ready to sign`,
      body: leaseSentToResidentBody(res, lease),
    });
  }

  async function confirmSendLeaseToResident(skipMessage: boolean) {
    if (!leaseSentPreview || leaseSendBusy) return;
    const { res, lease, subject, body } = leaseSentPreview;
    setLeaseSendBusy(true);
    try {
      const sendResult = await sendLeaseToResident(lease.id, userId);
      if (!sendResult.ok) {
        showToast(sendResult.error ?? "Could not send lease.");
        return;
      }
      setLeaseSentPreview(null);
      appendLeaseThreadMessage(lease.id, "manager", "Sent lease to resident for review and signature.", userId);
      if (skipMessage) {
        showToast("Lease sent to resident portal (no notification sent).");
      } else {
        const notice = await deliverPortalInboxMessage({
          fromName: managerEmail ?? "Property Manager",
          toEmails: [res.email],
          subject,
          text: body,
        });
        if (notice.ok) {
          showToast(
            notice.skipped
              ? "Lease sent to resident portal (demo inbox only)."
              : "Lease sent to resident portal with inbox and email notification.",
          );
        } else {
          showToast("Lease sent to resident portal. Notification could not be delivered.");
        }
      }
      setLeaseTick((n) => n + 1);
    } finally {
      setLeaseSendBusy(false);
    }
  }

  function saveManualResident() {
    if (!arName.trim()) { showToast("Enter the resident's name."); return; }
    if (!arEmail.trim()) { showToast("Enter the resident's email."); return; }
    const rent = arRent.trim() ? Number(arRent.replace(/[^\d.]/g, "")) : null;
    const utilities = arUtilities.trim() ? Number(arUtilities.replace(/[^\d.]/g, "")) : null;
    const moveInFee = arMoveInFee.trim() ? Number(arMoveInFee.replace(/[^\d.]/g, "")) : null;
    const secDeposit = arSecurityDeposit.trim() ? Number(arSecurityDeposit.replace(/[^\d.]/g, "")) : null;
    const axisId = `AXIS-${Date.now().toString(36).toUpperCase().slice(-8)}`;
    const propLabel = arPropertyId
      ? (propertyOptions.find((p) => p.id === arPropertyId)?.label ?? arPropertyId)
      : "—";
    const selectedRoomLabel = arRoomId ? arRoomOptions.find((room) => room.id === arRoomId)?.name?.trim() ?? "" : "";
    const nextRow: DemoApplicantRow = {
      id: axisId,
      name: arName.trim(),
      email: arEmail.trim(),
      property: propLabel,
      stage: "Active",
      bucket: "approved",
      detail: "",
      assignedPropertyId: arPropertyId || undefined,
      assignedRoomChoice: arPropertyId && arRoomId ? `${arPropertyId}${LISTING_ROOM_CHOICE_SEP}${arRoomId}` : undefined,
      signedMonthlyRent: rent ?? undefined,
      managerUserId: userId ?? undefined,
      manuallyAdded: true,
      manualResidentDetails: {
        moveInDate: arMoveInDate || undefined,
        moveOutDate: arMoveOutDate || undefined,
        monthlyUtilities: utilities ?? undefined,
        moveInFee: moveInFee ?? undefined,
        securityDeposit: secDeposit ?? undefined,
        roomNumber: selectedRoomLabel || undefined,
        leaseTerm: arLeaseTerm || undefined,
        notes: arNotes.trim() || undefined,
      },
    };
    appendManagerApplicationRow(nextRow);
    recordApprovedApplicationCharges(nextRow, userId ?? null);
    void syncHouseholdChargesFromServer(true).then(() => setHcTick((n) => n + 1));
    setChargeTab("pending");
    setArName(""); setArEmail(""); setArPropertyId(""); setArRoomId(""); setArLeaseTerm("");
    setArMoveInDate(""); setArMoveOutDate(""); setArRent(""); setArUtilities("");
    setArMoveInFee(""); setArSecurityDeposit(""); setArNotes("");
    setAddResidentOpen(false);
    setHcTick((n) => n + 1);
    showToast(`Resident added — Axis ID: ${axisId}`);
  }

  function openEditResidentModal() {
    if (!selected) return;
    const row = readManagerApplicationRows().find((r) => r.id === selected.id);
    if (!row) {
      showToast("Resident record not found.");
      return;
    }
    const app = row.application;
    const assignedPropId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || app?.propertyId?.trim() || "";
    const assignedRoomChoice = row.assignedRoomChoice?.trim() || app?.roomChoice1?.trim() || "";
    const assignedRoomId =
      assignedPropId && assignedRoomChoice.startsWith(`${assignedPropId}${LISTING_ROOM_CHOICE_SEP}`)
        ? assignedRoomChoice.slice(`${assignedPropId}${LISTING_ROOM_CHOICE_SEP}`.length)
        : assignedRoomChoice;
    setErName(row.name || app?.fullLegalName?.trim() || "");
    setErEmail(row.email?.trim() || app?.email?.trim() || "");
    setErPropertyId(assignedPropId);
    setErRoomId(assignedRoomId);
    setErLeaseTerm(row.manualResidentDetails?.leaseTerm || app?.leaseTerm || "");
    setErMoveInDate(row.manualResidentDetails?.moveInDate || app?.leaseStart || "");
    setErMoveOutDate(row.manualResidentDetails?.moveOutDate || app?.leaseEnd || "");
    const savedRent = Number.isFinite(row.signedMonthlyRent ?? NaN) ? String(row.signedMonthlyRent ?? "") : "";
    setErRent(savedRent || app?.managerRentOverride?.trim() || "");
    const savedUtils = row.manualResidentDetails?.monthlyUtilities != null ? String(row.manualResidentDetails.monthlyUtilities) : "";
    setErUtilities(savedUtils || app?.managerUtilitiesOverride?.trim() || "");
    const savedFee = row.manualResidentDetails?.moveInFee != null ? String(row.manualResidentDetails.moveInFee) : "";
    setErMoveInFee(savedFee || app?.managerMoveInFeeOverride?.trim() || "");
    const savedDeposit = row.manualResidentDetails?.securityDeposit != null ? String(row.manualResidentDetails.securityDeposit) : "";
    setErSecurityDeposit(savedDeposit || app?.managerSecurityDepositOverride?.trim() || "");
    setErNotes(row.manualResidentDetails?.notes || "");
    setEditResidentOpen(true);
  }

  function saveEditedResident() {
    if (!selected) return;
    if (!erName.trim()) {
      showToast("Enter the resident's name.");
      return;
    }
    const rows = readManagerApplicationRows();
    const idx = rows.findIndex((r) => r.id === selected.id);
    if (idx === -1) {
      showToast("Resident record not found.");
      return;
    }
    const rent = erRent.trim() ? Number(erRent.replace(/[^\d.]/g, "")) : null;
    const utilities = erUtilities.trim() ? Number(erUtilities.replace(/[^\d.]/g, "")) : null;
    const moveInFee = erMoveInFee.trim() ? Number(erMoveInFee.replace(/[^\d.]/g, "")) : null;
    const secDeposit = erSecurityDeposit.trim() ? Number(erSecurityDeposit.replace(/[^\d.]/g, "")) : null;
    const propId = erPropertyId.trim();
    const propLabel = propId ? propertyOptions.find((p) => p.id === propId)?.label ?? rows[idx]!.property : rows[idx]!.property;
    const selectedRoomLabel = erRoomId ? erRoomOptions.find((room) => room.id === erRoomId)?.name?.trim() ?? "" : "";

    const existing = rows[idx]!;
    const newRoomChoice = propId && erRoomId ? `${propId}${LISTING_ROOM_CHOICE_SEP}${erRoomId}` : undefined;
    const nextRow: DemoApplicantRow = {
      ...existing,
      name: erName.trim(),
      email: erEmail.trim() || existing.email,
      property: propLabel,
      assignedPropertyId: propId || undefined,
      assignedRoomChoice: newRoomChoice,
      signedMonthlyRent: rent ?? undefined,
      manualResidentDetails: {
        ...(existing.manualResidentDetails ?? {}),
        moveInDate: erMoveInDate || undefined,
        moveOutDate: erMoveOutDate || undefined,
        monthlyUtilities: utilities ?? undefined,
        moveInFee: moveInFee ?? undefined,
        securityDeposit: secDeposit ?? undefined,
        roomNumber: selectedRoomLabel || undefined,
        leaseTerm: erLeaseTerm || undefined,
        notes: erNotes.trim() || undefined,
      },
      // Mirror all edits back into the application so both views stay consistent.
      application: existing.application
        ? {
            ...existing.application,
            fullLegalName: erName.trim() || existing.application.fullLegalName,
            email: erEmail.trim() || existing.application.email,
            propertyId: propId || existing.application.propertyId,
            roomChoice1: newRoomChoice ?? existing.application.roomChoice1,
            leaseTerm: erLeaseTerm || existing.application.leaseTerm,
            leaseStart: erMoveInDate || existing.application.leaseStart,
            leaseEnd: erMoveOutDate || existing.application.leaseEnd,
            managerRentOverride: erRent.trim() || existing.application.managerRentOverride,
            managerUtilitiesOverride: erUtilities.trim() || existing.application.managerUtilitiesOverride,
            managerMoveInFeeOverride: erMoveInFee.trim() || existing.application.managerMoveInFeeOverride,
            managerSecurityDepositOverride: erSecurityDeposit.trim() || existing.application.managerSecurityDepositOverride,
          }
        : existing.application,
    };

    const next = [...rows];
    next[idx] = nextRow;
    writeManagerApplicationRows(next);
    upsertApplicationRowToServer(nextRow);

    // Update pending recurring rent charge amounts immediately, then refresh all one-time charges
    // (security deposit, move-in fee, prorated first month, application fee) and the recurring profile.
    const residentEmail = nextRow.email ?? "";
    if (propId && residentEmail && rent != null && Number.isFinite(rent)) {
      updatePendingRentAmountForResident(residentEmail, propId, rent, userId ?? null);
    }
    recordApprovedApplicationCharges(nextRow, userId ?? null);

    // Auto-regenerate any unsigned leases so room/rent/rules changes are reflected immediately
    if (residentEmail && nextRow.application) {
      const leasesToRegen = readLeasePipeline(userId ?? undefined).filter(
        (lr) =>
          lr.residentEmail.trim().toLowerCase() === residentEmail.trim().toLowerCase() &&
          leaseAllowsManagerDocumentEdits(lr),
      );
      for (const lr of leasesToRegen) {
        updateLeasePipelineRow(lr.id, {
          application: { ...(lr.application ?? {}), ...nextRow.application },
        }, userId);
        generateLeaseHtmlForRow(lr.id, userId);
      }
    }

    setEditResidentOpen(false);
    setHcTick((n) => n + 1);
    showToast("Resident updated.");
  }

  async function deleteSelectedResident() {
    if (!selected) return;
    const selectedResident = selected;
    if (!window.confirm(`Delete resident ${selectedResident.name || selectedResident.email}? This cannot be undone.`)) return;

    const allRows = readManagerApplicationRows();
    if (!allRows.some((row) => row.id === selectedResident.id)) {
      showToast("Resident not found.");
      return;
    }

    let serverDeleteError: string | null = null;
    try {
      const res = await fetch("/api/portal/delete-resident-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: selectedResident.email,
          purgeData: true,
          applicationId: selectedResident.id,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        serverDeleteError = body?.error ?? "Could not delete resident.";
      }
    } catch {
      serverDeleteError = "Could not delete resident.";
    }

    if (serverDeleteError) {
      showToast(serverDeleteError);
      return;
    }

    writeManagerApplicationRows(allRows.filter((row) => row.id !== selectedResident.id));

    const residentEmail = selectedResident.email.trim().toLowerCase();
    removeResidentHouseholdPaymentData(selectedResident.email);

    const residentLeases = readLeasePipeline(userId).filter(
      (row) => row.residentEmail.trim().toLowerCase() === residentEmail,
    );
    for (const leaseRow of residentLeases) {
      deleteLeasePipelineRow(leaseRow.id, userId);
    }

    const residentWorkOrders = readManagerWorkOrderRows().filter(
      (row) => row.residentEmail?.trim().toLowerCase() === residentEmail,
    );
    for (const workOrder of residentWorkOrders) {
      deleteManagerWorkOrderRow(workOrder.id);
    }

    deleteServiceRequestsForResident(selectedResident.email);

    const allInbox = loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []);
    const deletedThreads = allInbox.filter((thread) => thread.email.trim().toLowerCase() === residentEmail);
    const nextInbox = allInbox.filter((thread) => thread.email.trim().toLowerCase() !== residentEmail);
    persistInbox(MANAGER_INBOX_STORAGE_KEY, nextInbox);
    for (const thread of deletedThreads) {
      void fetch("/api/portal-inbox-threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "delete", id: thread.id }),
      }).catch(() => undefined);
    }

    await syncManagerApplicationsFromServer({ force: true, managerUserId: userId });
    setSelectedId(null);
    setHcTick((n) => n + 1);
    setLeaseTick((n) => n + 1);
    setWorkOrderTick((n) => n + 1);
    setInboxTick((n) => n + 1);
    showToast("Resident and all related portal data deleted.");
  }

  function leaseGenerationGateTitle(row: LeasePipelineRow): string | undefined {
    const gate = leaseGenerationSupportedForRow(row);
    return gate.ok ? undefined : gate.error;
  }

  function runGenerateLease(rowId: string) {
    if (generatingLeaseRowId) return;
    setGeneratingLeaseRowId(rowId);
    window.setTimeout(() => {
      try {
        const result = generateLeaseHtmlForRow(rowId, userId);
        if (result.ok) {
          setLeaseTick((n) => n + 1);
          showToast(`Lease generated (v${result.version}).`);
        } else {
          showToast(result.error);
        }
      } finally {
        setGeneratingLeaseRowId(null);
        setRegenerateConfirmLeaseId(null);
      }
    }, 0);
  }

  function openGenerateLeaseConfirm(rowId: string) {
    if (generatingLeaseRowId) return;
    const row = readLeasePipeline(userId).find((r) => r.id === rowId);
    if (!row || !leaseAllowsManagerDocumentEdits(row) || !leaseGenerationSupportedForRow(row).ok) return;
    setRegenerateConfirmLeaseId(rowId);
  }

  function signLeaseAsManager(row: LeasePipelineRow) {
    if (!residentHasSignedLease(row)) {
      showToast("The resident must sign the lease before you can countersign.");
      return;
    }
    setSigningLease(row);
  }

  async function handleManagerModalSign(signatureName: string) {
    if (!signingLease) return false;
    const ok = await managerSignLease(signingLease.id, signatureName.trim(), userId);
    if (ok) {
      setLeaseTick((n) => n + 1);
      showToast(
        hasBothLeaseSignatures({
          ...signingLease,
          managerSignature: { role: "manager", name: signatureName.trim(), signedAtIso: new Date().toISOString() },
        })
          ? "Lease fully signed."
          : "Manager signature saved.",
      );
      setSigningLease(null);
      return true;
    } else {
      showToast("Could not sign lease.");
      return false;
    }
  }

  const residentDetailPanel =
    selectedId && selected ? (
                          <div className="flex flex-col gap-4">
                            <div className="rounded-2xl border border-border bg-card p-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-full bg-primary/[0.06] px-3 py-1 text-xs text-primary hover:bg-primary/[0.12]"
                                  onClick={() => {
                                    const signupUrl = residentAccountCreationUrl(window.location.origin, selected.axisId);
                                    const previewBody = buildResidentWelcomeEmailBody({ residentName: selected.name, axisId: selected.axisId, signupUrl });
                                    setWelcomePreviewContent(previewBody);
                                    setWelcomePreviewFor(selected);
                                  }}
                                >
                                  Email account setup
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-full px-3 py-1 text-xs"
                                  onClick={openEditResidentModal}
                                >
                                  Edit resident
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-full border-rose-200 px-3 py-1 text-xs text-rose-800 hover:bg-[var(--status-overdue-bg)]"
                                  onClick={deleteSelectedResident}
                                >
                                  Delete resident
                                </Button>
                              </div>
                            </div>

                            <ResidentDetailSection
                              title="Application"
                              summary={
                                selectedApplicationRow
                                  ? `Application — Approved · ${selected.name}`
                                  : "No application on file for this resident."
                              }
                              expanded={expandedResidentSection === "application"}
                              onToggle={() =>
                                setExpandedResidentSection((cur) => (cur === "application" ? null : "application"))
                              }
                            >
                              {selectedApplicationRow ? (
                                <>
                                  <div className="mb-4 flex flex-wrap items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-full px-3 py-1 text-xs"
                                      onClick={() => downloadApplicationPdf(selectedApplicationRow)}
                                    >
                                      Download PDF
                                    </Button>
                                  </div>
                                  <ApplicationDocumentPreview row={selectedApplicationRow} />
                                </>
                              ) : (
                                <p className="text-sm text-muted">No application on file for this resident.</p>
                              )}
                            </ResidentDetailSection>

                            <ResidentDetailSection
                              title="Lease"
                              summary={
                                residentLease
                                  ? `${residentLease.status ?? residentLease.stageLabel} · ${residentLease.application?.leaseStart || "No move-in"}${residentLease.application?.leaseEnd ? ` to ${residentLease.application.leaseEnd}` : ""}`
                                  : "No lease created yet for this resident."
                              }
                              expanded={expandedResidentSection === "lease"}
                              onToggle={() => setExpandedResidentSection((cur) => (cur === "lease" ? null : "lease"))}
                            >
                              <div className="flex flex-wrap items-center justify-start gap-3">
                                {residentLease ? (
                                  <div className="flex flex-wrap gap-2">
                                    {leaseAllowsManagerDocumentEdits(residentLease) ? (
                                      <>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-full px-3 py-1 text-xs"
                                      disabled={
                                        generatingLeaseRowId === residentLease.id ||
                                        !leaseGenerationSupportedForRow(residentLease).ok
                                      }
                                      title={leaseGenerationGateTitle(residentLease)}
                                      onClick={() => openGenerateLeaseConfirm(residentLease.id)}
                                    >
                                      {generatingLeaseRowId === residentLease.id ? "Generating..." : "Generate lease"}
                                    </Button>
                                    <label className="inline-flex cursor-pointer items-center rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-accent/30">
                                      {uploadingLeaseRowId === residentLease.id ? "Uploading..." : "Upload PDF"}
                                      <input
                                        type="file"
                                        accept="application/pdf"
                                        className="sr-only"
                                        onChange={async (e) => {
                                          const file = e.target.files?.[0];
                                          if (!file || !residentLease) return;
                                          setUploadingLeaseRowId(residentLease.id);
                                          const result = await managerUploadLeasePdf(residentLease.id, file, userId);
                                          setUploadingLeaseRowId(null);
                                          e.currentTarget.value = "";
                                          if (result.ok) {
                                            setLeaseTick((n) => n + 1);
                                            showToast("Lease PDF uploaded.");
                                          } else {
                                            showToast(result.error ?? "Upload failed.");
                                          }
                                        }}
                                      />
                                    </label>
                                      </>
                                    ) : null}
                                    {!residentLease.managerSignature && residentHasSignedLease(residentLease) ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-full px-3 py-1 text-xs"
                                        disabled={
                                          !residentLease.generatedHtml && !residentLease.managerUploadedPdf?.dataUrl
                                        }
                                        onClick={() => signLeaseAsManager(residentLease)}
                                      >
                                        Sign as manager
                                      </Button>
                                    ) : null}
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-full px-3 py-1 text-xs"
                                      onClick={() => {
                                        if (residentLease.managerUploadedPdf?.dataUrl) {
                                          downloadLeaseFromRow(residentLease);
                                        } else if (residentLease.generatedHtml) {
                                          printLeaseAsPdf(residentLease);
                                        } else {
                                          showToast("Generate or upload a lease first.");
                                          return;
                                        }
                                        showToast("Lease download started.");
                                      }}
                                    >
                                      Download lease
                                    </Button>
                                    {residentLease.status === "Manager Review" || residentLease.status === "Draft" ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-full px-3 py-1 text-xs"
                                        disabled={leaseSendBusy}
                                        onClick={() => openLeaseSendPreview(selected, residentLease)}
                                      >
                                        {leaseSendBusy ? "Sending…" : "Send to resident"}
                                      </Button>
                                    ) : residentLease.status === "Resident Signature Pending" ? (
                                      <>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          className="rounded-full px-3 py-1 text-xs"
                                          disabled={leaseReminderBusy}
                                          onClick={() => openLeaseSigningReminderPreview(selected, residentLease)}
                                        >
                                          {leaseReminderBusy ? "Sending…" : "Send signing reminder"}
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          className="rounded-full px-3 py-1 text-xs"
                                          onClick={() => {
                                            const moveResult = sendLeaseBackToManager(residentLease.id, userId);
                                            if (!moveResult.ok) {
                                              showToast(moveResult.error);
                                              return;
                                            }
                                            appendLeaseThreadMessage(residentLease.id, "manager", "Moved lease back to manager review.", userId);
                                            setLeaseTick((n) => n + 1);
                                            showToast("Lease moved to Manager Review.");
                                          }}
                                        >
                                          Move to manager review
                                        </Button>
                                      </>
                                    ) : null}
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-full border-rose-200 px-3 py-1 text-xs text-rose-800 hover:bg-[var(--status-overdue-bg)]"
                                      onClick={() => {
                                        if (!window.confirm(`Delete the lease for ${selected.name}? This cannot be undone.`)) return;
                                        if (deleteLeasePipelineRow(residentLease.id, userId)) {
                                          setLeaseTick((n) => n + 1);
                                          showToast("Lease deleted.");
                                        } else {
                                          showToast("Could not delete lease.");
                                        }
                                      }}
                                    >
                                      Delete lease
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                              {residentLease ? (
                                <div className="mt-4">
                                  <div className="rounded-2xl border border-border bg-accent/30 p-3">
                                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Lease document</p>
                                    <p className="mt-1 text-xs text-muted">
                                      Single active lease document. Signatures are applied to this same lease as the workflow advances.
                                    </p>
                                  </div>
                                  <LeaseDocumentPreview
                                    className="mt-3"
                                    row={residentLease}
                                    emptyHint="No lease document yet. Generate or upload one from Manager Review first."
                                  />
                                  {residentLease.thread.length ? (
                                    <div className="mt-3 rounded-2xl border border-border bg-card p-4">
                                      <div className="flex items-center justify-between gap-3">
                                        <div>
                                          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Lease messages</p>
                                          <p className="mt-1 text-sm text-muted">
                                            Resident edit requests and lease-specific updates appear here.
                                          </p>
                                        </div>
                                        <span className="rounded-full bg-accent/30 px-2.5 py-1 text-[10px] font-semibold text-muted">
                                          {residentLease.status ?? residentLease.stageLabel}
                                        </span>
                                      </div>
                                      <div className="mt-3 space-y-2">
                                        {residentLease.thread.map((message) => (
                                          <div key={message.id} className="rounded-xl border border-border bg-accent/30 px-3 py-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                                              {message.role}
                                              <span className="normal-case tracking-normal text-muted">
                                                {" "}
                                                · {new Date(message.at).toLocaleString()}
                                              </span>
                                            </p>
                                            <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{message.body}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <p className="mt-3 text-sm text-muted">Approve the application and create or generate a lease here for this resident.</p>
                              )}
                            </ResidentDetailSection>

                            <ResidentDetailSection
                              title="Payments"
                              summary={
                                residentCharges.length === 0
                                  ? "No charges yet."
                                  : `${chargeCounts.pending} unpaid · $${(pendingBalance / 100).toFixed(2)} due${overdueChargeCount > 0 ? ` · ${overdueChargeCount} overdue` : ""}`
                              }
                              expanded={expandedResidentSection === "payments"}
                              onToggle={() =>
                                setExpandedResidentSection((cur) => (cur === "payments" ? null : "payments"))
                              }
                              headerAction={
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
                                  onClick={() => setAddPaymentMethodOpen(true)}
                                >
                                  Add payment method
                                </Button>
                              }
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <ManagerPortalStatusPills
                                  tabs={[
                                    { id: "pending", label: "Unpaid", count: chargeCounts.pending },
                                    { id: "paid", label: "Paid", count: chargeCounts.paid },
                                  ]}
                                  activeId={chargeTab}
                                  onChange={(id) => setChargeTab(id as "pending" | "paid")}
                                />
                                <div className="inline-flex shrink-0 items-center rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted">
                                  Unpaid: <span className="ms-1 tabular-nums text-foreground">${(pendingBalance / 100).toFixed(2)}</span>
                                </div>
                                {overdueChargeCount > 0 ? (
                                  <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--status-overdue-fg)_30%,transparent)] bg-[var(--status-overdue-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--status-overdue-fg)]">
                                    <span aria-hidden className="size-1.5 rounded-full bg-current" />
                                    {overdueChargeCount} overdue
                                  </div>
                                ) : null}
                              </div>
                              {visibleCharges.length === 0 ? (
                                <div className="mt-3">
                                  <PortalDataTableEmpty
                                    icon="payment"
                                    message={
                                      residentCharges.length === 0
                                        ? "No charges yet."
                                        : chargeTab === "pending"
                                          ? "No unpaid charges yet."
                                          : "No paid charges yet."
                                    }
                                  />
                                </div>
                              ) : (
                                <div className={`mt-3 ${PORTAL_DATA_TABLE_WRAP}`}>
                                  <div className={PORTAL_DATA_TABLE_SCROLL}>
                                    <table className="sm:min-w-[640px] w-full border-collapse text-left text-sm">
                                      <thead>
                                        <tr className={PORTAL_TABLE_HEAD_ROW}>
                                          <th className={`${MANAGER_TABLE_TH} text-left`}>Charge</th>
                                          <th className={`${MANAGER_TABLE_TH} text-left hidden sm:table-cell`}>Property</th>
                                          <th className={`${MANAGER_TABLE_TH} text-left`}>Due</th>
                                          <th className={`${MANAGER_TABLE_TH} text-left`}>Amount</th>
                                          <th className={`${MANAGER_TABLE_TH} text-left hidden sm:table-cell`}>Balance</th>
                                          <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {visibleCharges.map((c) => {
                                          const overdue = c.status === "pending" && isHouseholdChargeOverdue(c);
                                          return (
                                            <Fragment key={c.id}>
                                              <tr
                                                className={PORTAL_TABLE_TR_EXPANDABLE}
                                                onClick={createPortalRowExpandClick(() =>
                                                  setChargeExpandedId((cur) => (cur === c.id ? null : c.id)),
                                                )}
                                                aria-expanded={chargeExpandedId === c.id}
                                              >
                                                <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{c.title}</td>
                                                <td className={`${PORTAL_TABLE_TD} hidden sm:table-cell`}>{selected.propertyLabel || "—"}</td>
                                                <td className={PORTAL_TABLE_TD}>{chargeDueLabel(c)}</td>
                                                <td className={`${PORTAL_TABLE_TD} tabular-nums text-foreground`}>{c.amountLabel}</td>
                                                <td className={`${PORTAL_TABLE_TD} tabular-nums font-semibold text-foreground hidden sm:table-cell`}>
                                                  {c.balanceLabel}
                                                </td>
                                                <td className={PORTAL_TABLE_TD}>
                                                  <Badge tone={c.status === "paid" ? "approved" : overdue ? "overdue" : "pending"}>
                                                    {c.status === "paid" ? "Paid" : overdue ? "Overdue" : "Unpaid"}
                                                  </Badge>
                                                </td>
                                              </tr>
                                              {chargeExpandedId === c.id ? (
                                                <tr className={PORTAL_TABLE_DETAIL_ROW}>
                                                  <td colSpan={6} className={PORTAL_TABLE_DETAIL_CELL}>
                                                    <div className="space-y-1 text-sm text-muted">
                                                      <p>
                                                        Property: <span className="text-foreground">{selected.propertyLabel || "—"}</span>
                                                      </p>
                                                      <p>
                                                        Due: <span className="text-foreground">{chargeDueLabel(c)}</span>
                                                      </p>
                                                      <p>
                                                        Amount: <span className="tabular-nums text-foreground">{c.amountLabel}</span> · Balance:{" "}
                                                        <span className="tabular-nums font-semibold text-foreground">{c.balanceLabel}</span>
                                                      </p>
                                                    </div>
                                                    <PortalTableDetailActions>
                                                      {c.status !== "paid" ? (
                                                        <>
                                                          <Button
                                                            type="button"
                                                            variant="outline"
                                                            className={PORTAL_DETAIL_BTN_PRIMARY}
                                                            onClick={() => {
                                                              if (markHouseholdChargePaid(c.id, userId)) {
                                                                showToast("Marked as paid.");
                                                                setChargeExpandedId(null);
                                                              } else {
                                                                showToast("Could not update this charge.");
                                                              }
                                                            }}
                                                          >
                                                            Mark as paid
                                                          </Button>
                                                          <Button
                                                            type="button"
                                                            variant="outline"
                                                            className={PORTAL_DETAIL_BTN}
                                                            onClick={() => {
                                                              if (markHouseholdChargePaid(c.id, userId)) {
                                                                showToast("Recorded as paid with Zelle.");
                                                                setChargeExpandedId(null);
                                                              } else {
                                                                showToast("Could not update this charge.");
                                                              }
                                                            }}
                                                          >
                                                            Paid with Zelle
                                                          </Button>
                                                          <Button
                                                            type="button"
                                                            variant="outline"
                                                            className={PORTAL_DETAIL_BTN}
                                                            onClick={() => {
                                                              if (markHouseholdChargePaid(c.id, userId)) {
                                                                showToast("Recorded as paid with Venmo.");
                                                                setChargeExpandedId(null);
                                                              } else {
                                                                showToast("Could not update this charge.");
                                                              }
                                                            }}
                                                          >
                                                            Paid with Venmo
                                                          </Button>
                                                        </>
                                                      ) : (
                                                        <Button
                                                          type="button"
                                                          variant="outline"
                                                          className={PORTAL_DETAIL_BTN}
                                                          onClick={() => {
                                                            if (markHouseholdChargePending(c.id, userId)) {
                                                              showToast("Moved to unpaid.");
                                                              setChargeExpandedId(null);
                                                            } else {
                                                              showToast("Could not update this charge.");
                                                            }
                                                          }}
                                                        >
                                                          Move to unpaid
                                                        </Button>
                                                      )}
                                                    </PortalTableDetailActions>
                                                  </td>
                                                </tr>
                                              ) : null}
                                            </Fragment>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </ResidentDetailSection>

                            <ResidentDetailSection
                              title="Services"
                              summary={
                                residentUnifiedServiceItems.length === 0
                                  ? "No service requests or work orders yet."
                                  : `${residentUnifiedServiceItems.length} request${residentUnifiedServiceItems.length === 1 ? "" : "s"} / work order${residentUnifiedServiceItems.length === 1 ? "" : "s"}`
                              }
                              expanded={expandedResidentSection === "services"}
                              onToggle={() =>
                                setExpandedResidentSection((cur) => (cur === "services" ? null : "services"))
                              }
                            >
                              <div className="mb-4">
                                <PillTabs
                                  items={[
                                    { id: "requests", label: "Requests" },
                                    { id: "work-orders", label: "Work orders" },
                                  ]}
                                  activeId={svcSubTab}
                                  onChange={(id) => {
                                    setSvcSubTab(id as "requests" | "work-orders");
                                    setSvcExpandedId(null);
                                  }}
                                />
                              </div>

                              {svcSubTab === "requests" ? (
                                <div>
                                  <div className="mb-3">
                                    <PillTabs
                                      items={REQUEST_STATUS_TABS.map(({ id, label }) => ({
                                        id,
                                        label: pillLabelWithCount(label, residentServiceRequestsCounts[id]),
                                      }))}
                                      activeId={svcRequestsFilter}
                                      onChange={(id) => setSvcRequestsFilter(id as RequestStatusBucket)}
                                    />
                                  </div>
                                  {residentUnifiedServiceItems.length === 0 ? (
                                    <PortalDataTableEmpty message="No service requests or work orders yet." icon="service" />
                                  ) : residentFilteredUnifiedServiceItems.length === 0 ? (
                                    <PortalDataTableEmpty message="No requests in this status yet." icon="service" />
                                  ) : (
                                    <div className={PORTAL_DATA_TABLE_WRAP}>
                                      <div className={PORTAL_DATA_TABLE_SCROLL}>
                                        <table className="min-w-[720px] w-full border-collapse text-left text-sm">
                                          <thead>
                                            <tr className={PORTAL_TABLE_HEAD_ROW}>
                                              <th className={`${MANAGER_TABLE_TH} text-left`}>Type</th>
                                              <th className={`${MANAGER_TABLE_TH} text-left`}>Item</th>
                                              <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                                              <th className={`${MANAGER_TABLE_TH} text-left`}>Charges</th>
                                              <th className={`${MANAGER_TABLE_TH} text-left`}>Return by</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {residentFilteredUnifiedServiceItems.map((item) => {
                                              if (item.kind === "request") {
                                                const req = item.req;
                                                const rowId = `request-${req.id}`;
                                                return (
                                                  <Fragment key={rowId}>
                                                    <tr
                                                      className={PORTAL_TABLE_TR_EXPANDABLE}
                                                      onClick={createPortalRowExpandClick(() =>
                                                        setSvcExpandedId((c) => (c === rowId ? null : rowId)),
                                                      )}
                                                      aria-expanded={svcExpandedId === rowId}
                                                    >
                                                      <td className={`${PORTAL_TABLE_TD} text-muted`}>Request</td>
                                                      <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{req.offerName}</td>
                                                      <td className={PORTAL_TABLE_TD}>
                                                        <ServiceStatusBadge status={req.status} />
                                                      </td>
                                                      <td className={PORTAL_TABLE_TD}>{requestChargesSummary(req)}</td>
                                                      <td className={PORTAL_TABLE_TD}>{req.returnByDate ? serviceRequestDateLabel(req.returnByDate) : "—"}</td>
                                                    </tr>
                                                    {svcExpandedId === rowId ? (
                                                      <tr className={PORTAL_TABLE_DETAIL_ROW}>
                                                        <td colSpan={5} className={PORTAL_TABLE_DETAIL_CELL}>
                                                          <ServiceRequestCard
                                                            req={req}
                                                            onReturnPhotoUploaded={() => setSrTick((n) => n + 1)}
                                                            onDelete={() => deleteResidentServiceRequest(req.id)}
                                                            onEdit={() => openServiceRequestEdit(req)}
                                                          />
                                                        </td>
                                                      </tr>
                                                    ) : null}
                                                  </Fragment>
                                                );
                                              }
                                              const row = item.row;
                                              const rowId = `work-order-${row.id}`;
                                              return (
                                                <Fragment key={rowId}>
                                                  <tr
                                                    className={PORTAL_TABLE_TR_EXPANDABLE}
                                                    onClick={createPortalRowExpandClick(() =>
                                                      setSvcExpandedId((c) => (c === rowId ? null : rowId)),
                                                    )}
                                                    aria-expanded={svcExpandedId === rowId}
                                                  >
                                                    <td className={`${PORTAL_TABLE_TD} text-muted`}>Work order</td>
                                                    <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{row.title}</td>
                                                    <td className={PORTAL_TABLE_TD}>
                                                      <WorkOrderStatusBadge bucket={row.bucket} />
                                                    </td>
                                                    <td className={PORTAL_TABLE_TD}>{row.cost && row.cost !== "—" ? row.cost : "—"}</td>
                                                    <td className={PORTAL_TABLE_TD}>—</td>
                                                  </tr>
                                                  {svcExpandedId === rowId ? (
                                                    <tr className={PORTAL_TABLE_DETAIL_ROW}>
                                                      <td colSpan={5} className={`${PORTAL_TABLE_DETAIL_CELL} text-sm text-muted`}>
                                                        <WorkOrderDetail
                                                          row={row}
                                                          onEdit={() => openWorkOrderRowEdit(row)}
                                                          onCancel={() => cancelResidentWorkOrder(row.id)}
                                                        />
                                                      </td>
                                                    </tr>
                                                  ) : null}
                                                </Fragment>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  <div className="mb-3">
                                    <PillTabs
                                      items={STATUS_TABS.map(({ id, label }) => ({
                                        id,
                                        label: pillLabelWithCount(label, residentWorkOrderBucketCounts[id]),
                                      }))}
                                      activeId={svcWorkOrderBucket}
                                      onChange={(id) => setSvcWorkOrderBucket(id as ResidentWorkBucket)}
                                    />
                                  </div>
                                  {residentWorkOrdersInBucket.length === 0 ? (
                                    <PortalDataTableEmpty
                                      icon="work-order"
                                      message={residentWorkOrders.length === 0 ? "No work orders yet." : "No work orders in this status yet."}
                                    />
                                  ) : (
                                    <div className={PORTAL_DATA_TABLE_WRAP}>
                                      <div className={PORTAL_DATA_TABLE_SCROLL}>
                                        <table className="min-w-[560px] w-full border-collapse text-left text-sm">
                                          <thead>
                                            <tr className={PORTAL_TABLE_HEAD_ROW}>
                                              <th className={`${MANAGER_TABLE_TH} text-left`}>ID</th>
                                              <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
                                              <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {residentWorkOrdersInBucket.map((row) => (
                                              <Fragment key={row.id}>
                                                <tr
                                                  className={PORTAL_TABLE_TR_EXPANDABLE}
                                                  onClick={createPortalRowExpandClick(() =>
                                                    setSvcExpandedId((c) => (c === row.id ? null : row.id)),
                                                  )}
                                                  aria-expanded={svcExpandedId === row.id}
                                                >
                                                  <td className={`${PORTAL_TABLE_TD} font-mono text-xs text-muted`}>{row.id}</td>
                                                  <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{row.title}</td>
                                                  <td className={PORTAL_TABLE_TD}>{row.status}</td>
                                                </tr>
                                                {svcExpandedId === row.id ? (
                                                  <tr className={PORTAL_TABLE_DETAIL_ROW}>
                                                    <td colSpan={3} className={`${PORTAL_TABLE_DETAIL_CELL} text-sm text-muted`}>
                                                      <WorkOrderDetail
                                                        row={row}
                                                        onEdit={() => openWorkOrderRowEdit(row)}
                                                        onCancel={() => cancelResidentWorkOrder(row.id)}
                                                      />
                                                    </td>
                                                  </tr>
                                                ) : null}
                                              </Fragment>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </ResidentDetailSection>

                            <ResidentDetailSection
                              title="Inbox"
                              summary={
                                residentInboxCounts.unopened > 0
                                  ? `${residentInboxCounts.unopened} unopened message${residentInboxCounts.unopened === 1 ? "" : "s"}`
                                  : "No unopened messages."
                              }
                              expanded={expandedResidentSection === "inbox"}
                              onToggle={() => setExpandedResidentSection((cur) => (cur === "inbox" ? null : "inbox"))}
                              headerAction={
                                <Button type="button" variant="outline" className="rounded-full px-3 py-1 text-xs" onClick={() => setMessageOpen(true)}>
                                  New message
                                </Button>
                              }
                            >
                              <div className="mb-3">
                                <ManagerPortalStatusPills
                                  activeTone="primary"
                                  tabs={INBOX_TAB_DEFS.map(({ id, label }) => ({
                                    id,
                                    label,
                                    count: residentInboxCounts[id as keyof typeof residentInboxCounts],
                                  }))}
                                  activeId={inboxSubTab}
                                  onChange={(id) => {
                                    setInboxSubTab(id as "unopened" | "opened" | "schedule" | "sent" | "trash");
                                    setInboxExpandedId(null);
                                  }}
                                />
                              </div>
                              {inboxSubTab === "schedule" ? (
                                <ManagerInboxSchedulePanel portalBase={portalBase} filterResidentEmail={selected.email} />
                              ) : residentInboxTableRows.length === 0 ? (
                                <PortalInboxEmptyState
                                  title={
                                    inboxSubTab === "trash"
                                      ? "No trash messages yet."
                                      : inboxSubTab === "sent"
                                        ? "No sent messages yet."
                                        : inboxSubTab === "opened"
                                          ? "No opened messages yet."
                                          : "No messages yet."
                                  }
                                />
                              ) : (
                                <PortalInboxMessageTable
                                  rows={residentInboxTableRows}
                                  primaryPartyHeader={inboxSubTab === "sent" ? "To" : "From"}
                                  onMarkRead={inboxSubTab === "unopened" ? markResidentInboxThreadRead : undefined}
                                  getDetailBody={(row) => residentInboxBodyById[row.id]}
                                  onReply={
                                    inboxSubTab === "trash"
                                      ? undefined
                                      : (row, text) => {
                                          const thread = residentInboxThreads.find((t) => t.id === row.id);
                                          if (!thread) return;
                                          return replyToResidentInboxThread(thread, text);
                                        }
                                  }
                                  expandedId={inboxExpandedId}
                                  onToggleExpand={(id) => setInboxExpandedId((cur) => (cur === id ? null : id))}
                                  renderExtraActions={(row) => {
                                    if (inboxSubTab === "trash") {
                                      return (
                                        <>
                                          <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => restoreResidentInboxThreadFromTrash(row.id)}>
                                            Restore
                                          </Button>
                                          <Button type="button" variant="danger" className={PORTAL_DETAIL_BTN} onClick={() => deleteResidentInboxThreadForever(row.id)}>
                                            Delete forever
                                          </Button>
                                        </>
                                      );
                                    }
                                    if (inboxSubTab === "opened") {
                                      return (
                                        <>
                                          <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => markResidentInboxThreadUnread(row.id)}>
                                            Mark unread
                                          </Button>
                                          <Button type="button" variant="danger" className={PORTAL_DETAIL_BTN} onClick={() => moveResidentInboxThreadToTrash(row.id)}>
                                            Trash
                                          </Button>
                                        </>
                                      );
                                    }
                                    return (
                                      <Button type="button" variant="danger" className={PORTAL_DETAIL_BTN} onClick={() => moveResidentInboxThreadToTrash(row.id)}>
                                        Trash
                                      </Button>
                                    );
                                  }}
                                />
                              )}
                            </ResidentDetailSection>
                          </div>
    ) : null;

  return (
    <>
      <LeaseRegenerateConfirmModal
        open={regenerateConfirmLeaseId !== null}
        busy={Boolean(regenerateConfirmLeaseId && generatingLeaseRowId === regenerateConfirmLeaseId)}
        onClose={() => {
          if (generatingLeaseRowId) return;
          setRegenerateConfirmLeaseId(null);
        }}
        onConfirm={() => {
          if (regenerateConfirmLeaseId) runGenerateLease(regenerateConfirmLeaseId);
        }}
      />
      {signingLease ? (
        <LeaseSigningModal
          row={signingLease}
          signerName=""
          signerRoleLabel="Manager / authorized agent name"
          agreementLabel="Residential Room Rental Agreement"
          onSign={handleManagerModalSign}
          onClose={() => setSigningLease(null)}
        />
      ) : null}
      <ManagerPortalPageShell
        title="Residents"
        titleAside={
          <div className={PORTAL_PAGE_ACTIONS_DESKTOP}>
            <PortalPropertyFilterPill
              propertyOptions={propertyOptions}
              propertyValue={propertyFilter}
              onPropertyChange={setPropertyFilter}
            />
            <Button type="button" variant="primary" className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`} onClick={() => setAddResidentOpen(true)}>
              + Add resident
            </Button>
          </div>
        }
        filterRow={
          <ManagerPortalFilterRow>
            <ManagerPortalStatusPills
              tabs={[
                { id: "current", label: "Current", count: currentResidentsCount },
                { id: "previous", label: "Previous", count: previousResidentsCount },
              ]}
              activeId={residentsTab}
              onChange={(id) => {
                const next = id as ResidentsTabId;
                setResidentsTab(next);
                navigate(`${portalBase}/residents/${next}`);
              }}
            />
            <div className={`${PORTAL_FILTER_ACTIONS_MOBILE} items-center`}>
              <PortalPropertyFilterPill
                propertyOptions={propertyOptions}
                propertyValue={propertyFilter}
                onPropertyChange={setPropertyFilter}
              />
              <Button type="button" variant="primary" className={PORTAL_HEADER_ACTION_BTN} onClick={() => setAddResidentOpen(true)}>
                + Add
              </Button>
            </div>
          </ManagerPortalFilterRow>
        }
      >
      {filtered.length === 0 ? (
        <PortalDataTableEmpty
          icon="residents"
          message={
            residents.length === 0
              ? "No residents yet."
              : residentsTab === "current"
                ? "No current residents yet."
                : "No previous residents yet."
          }
        />
      ) : (
      <>
      <div className="space-y-2 lg:hidden">
        {filtered.map((res) => (
          <div key={res.id} className={PORTAL_MOBILE_CARD_CLASS}>
            <button
              type="button"
              className="w-full text-left"
              onClick={() => setSelectedId((cur) => (cur === res.id ? null : res.id))}
            >
              <p className="truncate font-semibold text-foreground">{res.name || "—"}</p>
              <p className="mt-0.5 truncate text-xs text-muted">
                {[res.roomLabel, res.signedMonthlyRent ? `$${res.signedMonthlyRent.toFixed(2)}/mo` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {!propertyFilter && res.propertyLabel ? (
                <p className="mt-0.5 truncate text-[11px] text-muted/90">{res.propertyLabel}</p>
              ) : null}
            </button>
            <div className="mt-2">
              <Button
                type="button"
                variant="outline"
                className={PORTAL_DETAIL_BTN}
                onClick={() => setSelectedId((cur) => (cur === res.id ? null : res.id))}
              >
                {selectedId === res.id ? "Less" : "Details"}
              </Button>
            </div>
            {selectedId === res.id && selected ? (
              <div className="mt-3 border-t border-border pt-3">{residentDetailPanel}</div>
            ) : null}
          </div>
        ))}
      </div>
      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
            <table className="min-w-[680px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Name</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Email</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Room</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Move-in</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Move-out</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((res) => (
                  <Fragment key={res.id}>
                    <tr
                      className={PORTAL_TABLE_TR_EXPANDABLE}
                      onClick={createPortalRowExpandClick(() =>
                        setSelectedId((cur) => (cur === res.id ? null : res.id)),
                      )}
                      aria-expanded={selectedId === res.id}
                    >
                      <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>
                        {res.name || "—"}
                      </td>
                      <td className={PORTAL_TABLE_TD}>{res.email}</td>
                      <td className={PORTAL_TABLE_TD}>{res.propertyLabel || "—"}</td>
                      <td className={PORTAL_TABLE_TD}>{res.roomLabel || "—"}</td>
                      <td className={`${PORTAL_TABLE_TD} tabular-nums`}>{res.leaseStart ? shortDateLabel(res.leaseStart) : "—"}</td>
                      <td className={`${PORTAL_TABLE_TD} tabular-nums`}>{res.leaseEnd ? shortDateLabel(res.leaseEnd) : "—"}</td>
                    </tr>
                    {selectedId === res.id && selected ? (
                      <tr>
                        <td colSpan={6} className="bg-accent/30 px-4 py-5">
                          {residentDetailPanel}
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

      <Modal open={addPaymentMethodOpen} title="Add payment method" onClose={() => setAddPaymentMethodOpen(false)}>
        <div className="space-y-3 text-sm text-muted">
          <p>
            Axis doesn&apos;t store a saved payment method on file for residents yet — {selected?.name ?? "this resident"} chooses
            how to pay (bank/ACH, card, or Link) each time they check out a charge.
          </p>
          <p>
            To accept Zelle or Venmo for this property, add or update the contact info under that property&apos;s payment settings
            in Properties.
          </p>
        </div>
      </Modal>

      <Modal open={addResidentOpen} title="Add resident" onClose={() => setAddResidentOpen(false)}>
        <div className="space-y-3">
          <p className="text-xs text-muted">Creates an active resident record with an Axis ID. No application or lease is generated.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Full name *</span>
              <Input value={arName} onChange={(e) => setArName(e.target.value)} placeholder="Jane Smith" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Email *</span>
              <Input type="email" value={arEmail} onChange={(e) => setArEmail(e.target.value)} placeholder="jane@example.com" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Property</span>
              <select
                value={arPropertyId}
                onChange={(e) => { setArPropertyId(e.target.value); setArRoomId(""); }}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="">Select property…</option>
                {propertyOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Lease term</span>
              <select
                value={arLeaseTermSelectValue}
                onChange={(e) => {
                  const selected = e.target.value;
                  if (selected === AR_LEASE_TERM_CUSTOM) {
                    if (AR_LEASE_TERM_PRESETS.includes(arLeaseTerm as (typeof AR_LEASE_TERM_PRESETS)[number])) {
                      setArLeaseTerm("");
                    }
                    return;
                  }
                  setArLeaseTerm(selected);
                }}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="">Select…</option>
                <option value="Month-to-month">Month-to-month</option>
                <option value="12 months">12 months</option>
                <option value="6 months">6 months</option>
                <option value="3 months">3 months</option>
                <option value={AR_LEASE_TERM_CUSTOM}>Custom…</option>
              </select>
              {arLeaseTermSelectValue === AR_LEASE_TERM_CUSTOM ? (
                <Input
                  className="mt-2"
                  value={arLeaseTerm}
                  onChange={(e) => setArLeaseTerm(e.target.value)}
                  placeholder="e.g. 9 months"
                />
              ) : null}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Room</span>
              {arRoomOptions.length > 0 ? (
                <select
                  value={arRoomId}
                  onChange={(e) => {
                    const roomId = e.target.value;
                    setArRoomId(roomId);
                  }}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                >
                  <option value="">Select room…</option>
                  {arRoomOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}{r.monthlyRent ? ` — $${r.monthlyRent}/mo` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="rounded-xl border border-dashed border-border bg-accent/30 px-3 py-2 text-xs text-muted">
                  Add rooms to this property in listing setup to assign a resident room here.
                </p>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Monthly rent ($)</span>
              <Input type="number" min={0} step={0.01} value={arRent} onChange={(e) => setArRent(e.target.value)} placeholder="875.00" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Monthly utilities ($)</span>
              <Input type="number" min={0} step={0.01} value={arUtilities} onChange={(e) => setArUtilities(e.target.value)} placeholder="175.00" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Move-in fee ($)</span>
              <Input type="number" min={0} step={0.01} value={arMoveInFee} onChange={(e) => setArMoveInFee(e.target.value)} placeholder="200.00" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Security deposit ($)</span>
              <Input type="number" min={0} step={0.01} value={arSecurityDeposit} onChange={(e) => setArSecurityDeposit(e.target.value)} placeholder="875.00" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Move-in date</span>
              <Input type="date" value={arMoveInDate} onChange={(e) => setArMoveInDate(e.target.value)} />
            </label>
            {!isMonthToMonthLease ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-muted">Move-out date</span>
                <Input type="date" value={arMoveOutDate} onChange={(e) => setArMoveOutDate(e.target.value)} />
              </label>
            ) : null}
            <label className="col-span-2 flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Notes</span>
              <Textarea
                className="min-h-[72px]"
                value={arNotes}
                onChange={(e) => setArNotes(e.target.value)}
                placeholder="Any additional details about this resident…"
              />
            </label>
          </div>
          <div className="flex justify-start gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setAddResidentOpen(false)}>Cancel</Button>
            <Button type="button" variant="primary" className="rounded-full" onClick={saveManualResident}>Add resident</Button>
          </div>
        </div>
      </Modal>

      <Modal open={editResidentOpen} title="Edit resident" onClose={() => setEditResidentOpen(false)}>
        <div className="space-y-3">
          <p className="text-xs text-muted">Changes here update the resident record and application simultaneously.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Full name *</span>
              <Input value={erName} onChange={(e) => setErName(e.target.value)} placeholder="Jane Smith" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Email</span>
              <Input type="email" value={erEmail} onChange={(e) => setErEmail(e.target.value)} placeholder="resident@email.com" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Property</span>
              <select
                value={erPropertyId}
                onChange={(e) => {
                  setErPropertyId(e.target.value);
                  setErRoomId("");
                }}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="">Select property…</option>
                {propertyOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Lease term</span>
              <select
                value={erLeaseTermSelectValue}
                onChange={(e) => {
                  const selected = e.target.value;
                  if (selected === AR_LEASE_TERM_CUSTOM) {
                    if (AR_LEASE_TERM_PRESETS.includes(erLeaseTerm as (typeof AR_LEASE_TERM_PRESETS)[number])) {
                      setErLeaseTerm("");
                    }
                    return;
                  }
                  setErLeaseTerm(selected);
                }}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="">Select…</option>
                <option value="Month-to-month">Month-to-month</option>
                <option value="12 months">12 months</option>
                <option value="6 months">6 months</option>
                <option value="3 months">3 months</option>
                <option value={AR_LEASE_TERM_CUSTOM}>Custom…</option>
              </select>
              {erLeaseTermSelectValue === AR_LEASE_TERM_CUSTOM ? (
                <Input
                  className="mt-2"
                  value={erLeaseTerm}
                  onChange={(e) => setErLeaseTerm(e.target.value)}
                  placeholder="e.g. 9 months"
                />
              ) : null}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Room</span>
              {erRoomOptions.length > 0 ? (
                <select
                  value={erRoomId}
                  onChange={(e) => {
                    const roomId = e.target.value;
                    setErRoomId(roomId);
                  }}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                >
                  <option value="">Select room…</option>
                  {erRoomOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.monthlyRent ? ` — $${r.monthlyRent}/mo` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="rounded-xl border border-dashed border-border bg-accent/30 px-3 py-2 text-xs text-muted">
                  Add rooms to this property in listing setup to assign a resident room here.
                </p>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Monthly rent ($)</span>
              <Input type="number" min={0} step={0.01} value={erRent} onChange={(e) => setErRent(e.target.value)} placeholder="875.00" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Monthly utilities ($)</span>
              <Input type="number" min={0} step={0.01} value={erUtilities} onChange={(e) => setErUtilities(e.target.value)} placeholder="175.00" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Move-in fee ($)</span>
              <Input type="number" min={0} step={0.01} value={erMoveInFee} onChange={(e) => setErMoveInFee(e.target.value)} placeholder="200.00" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Security deposit ($)</span>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={erSecurityDeposit}
                onChange={(e) => setErSecurityDeposit(e.target.value)}
                placeholder="875.00"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Move-in date</span>
              <Input type="date" value={erMoveInDate} onChange={(e) => setErMoveInDate(e.target.value)} />
            </label>
            {!isEditMonthToMonthLease ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-muted">Move-out date</span>
                <Input type="date" value={erMoveOutDate} onChange={(e) => setErMoveOutDate(e.target.value)} />
              </label>
            ) : null}
            <label className="col-span-2 flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Notes</span>
              <Textarea
                className="min-h-[72px]"
                value={erNotes}
                onChange={(e) => setErNotes(e.target.value)}
                placeholder="Any additional details about this resident…"
              />
            </label>
          </div>
          <div className="flex justify-start gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setEditResidentOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" className="rounded-full" onClick={saveEditedResident}>
              Save resident
            </Button>
          </div>
        </div>
      </Modal>

      <PortalNotificationPreviewModal
        open={welcomePreviewFor !== null}
        title="Email account setup — preview"
        onClose={() => setWelcomePreviewFor(null)}
        recipient={welcomePreviewFor?.email ?? ""}
        subject={RESIDENT_WELCOME_EMAIL_SUBJECT}
        body={welcomePreviewContent}
        confirmLabel="Send email"
        confirmLabelWithoutMessage="Close without sending"
        confirmBusy={welcomePreviewFor !== null && welcomeEmailBusyForResident === welcomePreviewFor.id}
        confirmBusyLabel="Sending…"
        onConfirm={(skipMessage) => {
          if (!welcomePreviewFor) return;
          if (skipMessage) {
            setWelcomePreviewFor(null);
            return;
          }
          const res = welcomePreviewFor;
          setWelcomePreviewFor(null);
          void sendResidentAccountEmail(res);
        }}
      />

      <PortalNotificationPreviewModal
        open={leaseSentPreview !== null}
        title="Send lease to resident — preview"
        onClose={() => setLeaseSentPreview(null)}
        recipient={leaseSentPreview?.recipient ?? ""}
        subject={leaseSentPreview?.subject ?? ""}
        body={leaseSentPreview?.body ?? ""}
        footerNote="The lease will be released to the resident portal after you confirm. This message is delivered to Axis inbox and email."
        confirmLabel="Send lease & notification"
        confirmLabelWithoutMessage="Send lease only"
        confirmBusy={leaseSendBusy}
        confirmBusyLabel="Sending…"
        onConfirm={(skipMessage) => void confirmSendLeaseToResident(skipMessage)}
      />

      <PortalNotificationPreviewModal
        open={leaseReminderPreview !== null}
        title="Lease signing reminder — preview"
        onClose={() => setLeaseReminderPreview(null)}
        recipient={leaseReminderPreview?.recipient ?? ""}
        subject={leaseReminderPreview?.subject ?? ""}
        body={leaseReminderPreview?.body ?? ""}
        confirmLabel="Send reminder"
        confirmLabelWithoutMessage="Close without sending"
        confirmBusy={leaseReminderBusy}
        confirmBusyLabel="Sending…"
        onConfirm={(skipMessage) => {
          if (!leaseReminderPreview) return;
          if (skipMessage) {
            setLeaseReminderPreview(null);
            return;
          }
          const preview = leaseReminderPreview;
          setLeaseReminderPreview(null);
          void sendLeaseSigningReminder(preview.res, preview.leaseId, preview.subject, preview.body);
        }}
      />

      <Modal open={messageOpen} title="Message resident" onClose={() => setMessageOpen(false)}>
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Sending to <span className="font-semibold text-foreground">{selected?.email || "resident"}</span>.
          </p>
          <label className="block text-sm">
            <span className="font-medium text-muted">Subject</span>
            <Input className="mt-1.5" value={messageSubject} onChange={(e) => setMessageSubject(e.target.value)} placeholder="Subject" />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-muted">Message</span>
            <Textarea
              className="mt-1.5 min-h-[160px]"
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              placeholder="Write your message..."
            />
          </label>
          <div className="flex justify-start gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setMessageOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" className="rounded-full" onClick={sendResidentMessage}>
              Send
            </Button>
          </div>
        </div>
      </Modal>
      </ManagerPortalPageShell>

      <Modal
        open={editingServiceRequest !== null}
        title="Edit request"
        onClose={() => setEditingServiceRequest(null)}
        panelClassName="max-w-lg"
      >
        {editingServiceRequest ? (
          <>
            <p className="text-xs text-muted">
              Update the details of <span className="font-semibold text-foreground">{editingServiceRequest.offerName}</span>.
              Pricing is set by the listing and can&apos;t be changed here.
            </p>
            <div className="mt-4 grid gap-3">
              {hasDeposit(editingServiceRequest.deposit) ? (
                <div>
                  <p className="mb-1 text-[11px] font-medium text-muted">
                    Return by date <span className="text-rose-500">*</span>
                  </p>
                  <Input
                    type="date"
                    value={srEditReturnBy}
                    onChange={(e) => setSrEditReturnBy(e.target.value)}
                    className="bg-card"
                  />
                </div>
              ) : null}
              <div>
                <p className="mb-1 text-[11px] font-medium text-muted">Notes</p>
                <Textarea
                  value={srEditNotes}
                  onChange={(e) => setSrEditNotes(e.target.value)}
                  placeholder="Preferred timing, special instructions…"
                  rows={3}
                  className="bg-card"
                />
              </div>
            </div>
          </>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-start gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setEditingServiceRequest(null)}>
            Cancel
          </Button>
          <Button type="button" className="rounded-full" onClick={saveServiceRequestEdit}>
            Save changes
          </Button>
        </div>
      </Modal>

      <Modal
        open={editingWorkOrderRow !== null}
        title="Edit work order"
        onClose={() => setEditingWorkOrderRow(null)}
        panelClassName="max-w-lg"
      >
        <p className="text-xs text-muted">Update this maintenance request.</p>
        <div className="mt-4 grid gap-3">
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted">Title</p>
            <Input value={woEditTitle} onChange={(e) => setWoEditTitle(e.target.value)} placeholder="Short summary of the issue" className="bg-card" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted">Priority</p>
              <Select value={woEditPriority} onChange={(e) => setWoEditPriority(e.target.value)} className="bg-card">
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted">Preferred arrival time</p>
              <Input value={woEditArrival} onChange={(e) => setWoEditArrival(e.target.value)} placeholder='e.g. Weekdays after 5pm — or "anytime"' className="bg-card" />
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted">Details</p>
            <Textarea
              value={woEditDetails}
              onChange={(e) => setWoEditDetails(e.target.value)}
              placeholder="Describe the issue"
              rows={4}
              className="bg-card"
            />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-start gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setEditingWorkOrderRow(null)}>
            Cancel
          </Button>
          <Button type="button" className="rounded-full" onClick={saveWorkOrderRowEdit}>
            Save changes
          </Button>
        </div>
      </Modal>
    </>
  );
}
