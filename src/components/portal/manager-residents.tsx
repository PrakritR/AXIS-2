"use client";

import { isDemoModeActive } from "@/lib/demo/demo-session";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DestinationNav } from "@/components/ui/destination-nav";
import {Input, Textarea, Select} from "@/components/ui/input";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { PortalNotificationPreviewModal } from "@/components/portal/portal-notification-preview-modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  MANAGER_TABLE_TH,
  ManagerPortalFilterRow,
  ManagerPortalFilterActions,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
  ManagerPortalStatusFilterRow,
  PORTAL_HEADER_ACTION_BTN,
  RESIDENT_DETAIL_HEADER_ACTION_BTN,
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
  PORTAL_TABLE_EXPAND_TH,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PortalTableDetailActions,
  PortalTableInlineExpand,
  PortalTableExpandCell,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { ManagerPaymentsLedgerPanel } from "@/components/portal/manager-payments-ledger-panel";
import {
  ReminderSettingsModal,
  useScheduledPaymentMessages,
} from "@/components/portal/payment-schedule-ui";
import { formatFriendlyReminderSchedule } from "@/lib/payment-reminder-presets";
import type { ManagerPaymentBucket } from "@/data/demo-portal";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { PortalFilterSortSheet, portalFilterActiveCount } from "@/components/portal/portal-filter-sort-sheet";
import { PortalListControlStack } from "@/components/portal/portal-list-control-stack";
import { PortalSectionActionRow } from "@/components/portal/portal-section-action-row";
import {
  RESIDENT_DETAIL_TAB_LABELS,
  residentDetailHref,
  parseResidentDetailTab,
  type ResidentDetailTabId,
} from "@/lib/portal-detail-routes";
import {
  PortalDetailHeader,
  PortalListDetailPane,
  PortalListDetailPlaceholder,
  portalUsesDesktopSplit,
} from "@/components/portal/portal-list-detail-shell";
import { PortalPersonRecordRow } from "@/components/portal/portal-record-row";
import { INBOX_LIST_SCROLL } from "@/components/portal/portal-inbox-ui";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import { LeasePrimaryHeaderActions } from "@/components/portal/lease-primary-header-actions";
import { LeaseRegenerateConfirmModal } from "@/components/portal/lease-regenerate-confirm-modal";
import { LeaseSigningModal } from "@/components/portal/lease-signing-modal";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { usePaidPortalBasePath } from "@/lib/portal-base-path-client";
import {
  HOUSEHOLD_CHARGES_EVENT,
  HOUSEHOLD_CHARGES_SESSION_KEY,
  compareDueDateMs,
  householdChargeToLedgerRow,
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
  upsertApplicationRowToServerAwait,
  writeManagerApplicationRows,
  MANAGER_APPLICATIONS_EVENT,
  normalizeApplicationAxisId,
} from "@/lib/manager-applications-storage";
import {
  applicationVisibleToPortalUser,
  collectLinkedPropertyIds,
  collectLinkedPropertyIdsForModule,
  MANAGER_PORTFOLIO_REFRESH_EVENTS,
} from "@/lib/manager-portfolio-access";
import { isPreviousResidentDirectoryRow, isResidentDirectoryRow } from "@/lib/current-resident";
import { getPropertyById, getRoomChoiceLabel, LISTING_ROOM_CHOICE_SEP } from "@/lib/rental-application/data";
import { computeLeaseEndDate, shouldAutoComputeLeaseEnd } from "@/lib/rental-application/lease-dates";
import { resolveManualResidentPlacementValues } from "@/lib/rental-application/placement-values";
import { normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import {
  isResidentMonthToMonthLease,
  listingLeaseTermToResidentValue,
  RESIDENT_LEASE_TERM_CUSTOM,
  residentLeaseTermOptionsForProperty,
  residentLeaseTermSelectValue,
  residentLeaseTermToApplicationFields,
  shouldUseResidentLeaseCustomMode,
} from "@/lib/resident-manual-lease-terms";
import { buildLeaseReadyForResidentMessage } from "@/lib/resident-portal-login-copy";

import { sanitizePaymentContactInput } from "@/lib/listing-form-inputs";
import {
  buildMockPropertyFromDraft,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
  syncPropertyPipelineFromServer,
  updateExtraListingFromSubmissionOnServer,
} from "@/lib/demo-property-pipeline";
import { openStripeConnectOnboarding } from "@/lib/stripe-connect-onboarding-client";
import { acceptedPaymentMethodsForListing } from "@/lib/payment-policy";
import { deliverPortalInboxMessage } from "@/lib/portal-message-delivery";
import {
  appendLeaseThreadMessage,
  deleteLeasePipelineRow,
  deleteLeasePipelineRowsForResident,
  generateLeaseHtmlForRow,
  regenerateEditableLeasesForResident,
  leaseGenerationSupportedForRow,
  managerSignLease,
  leaseAllowsManagerDocumentEdits,
  LEASE_PIPELINE_EVENT,
  managerUploadLeasePdf,
  readLeasePipeline,
  residentCanViewLeaseRow,
  sendLeaseBackToManager,
  sendLeaseToResident,
  syncLeasePipelineFromApplications,
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
  deleteManagerWorkOrderRow,
} from "@/lib/manager-work-orders-storage";
import {
  SERVICE_REQUESTS_EVENT,
  readServiceRequestsForResident,
  readServiceRequestsForManager,
  deleteServiceRequestsForResident,
  type ServiceRequest,
} from "@/lib/service-requests-storage";
import type { DemoApplicantRow, ManagerApplicationBucket, ManagerWorkOrderBucket } from "@/data/demo-portal";
import { transitionApplicationBucket, stageLabelForApplicationBucket } from "@/lib/application-review";
import { isWithdrawnApplicationRow } from "@/lib/rental-application/resident-application-list";
import { buildApplicationGroups, groupForRow } from "@/lib/rental-application/application-groups";
import {
  invalidatePersistedInboxCache,
  loadPersistedInbox,
  MANAGER_INBOX_STORAGE_KEY,
  persistInbox,
  PORTAL_INBOX_CHANGED_EVENT,
  syncPersistedInboxFromServer,
  type PersistedInboxThread,
} from "@/lib/portal-inbox-storage";
import { clearUploadedOwnLease } from "@/lib/resident-lease-upload";
import {
  RESIDENT_WELCOME_EMAIL_SUBJECT,
  buildResidentWelcomeEmailBody,
  residentAccountCreationUrl,
} from "@/lib/resident-welcome-email";
import { Badge } from "@/components/ui/badge";
import { RadixSegmentedTabs } from "@/components/ui/radix-segmented-tabs";
import { ApplicationDocumentPreview } from "@/components/portal/manager-applications";
import { ApplicationGroupSection, groupIdForRow, groupRowInputForRow } from "@/components/portal/application-group-section";
import { ResidentApplicationEditor } from "@/components/portal/resident-application-editor";
import { ApplicationScreeningPanel } from "@/components/portal/application-screening-panel";
import { CheckrScreeningModal } from "@/components/portal/checkr-screening-modal";
import { ManagerResidentDetailInbox } from "@/components/portal/manager-resident-detail-inbox";
import { type ManagerSmsPanelHandle } from "@/components/portal/manager-sms-panel";
import {
  ServiceStatusBadge,
} from "@/components/portal/resident-services-panel";
import {
  ManagerServiceRequestDetail,
  managerServiceRequestBucket,
  managerServiceRequestPricingSummary,
  type ManagerServiceRequestBucket,
} from "@/components/portal/manager-service-request-detail";
import { ManagerWorkOrdersPanel } from "@/components/portal/manager-work-orders-panel";

import { ManagerAddPaymentModal } from "@/components/portal/manager-add-payment-modal";
import {
  ManagerCreateServiceRequestModal,
  type ManagerServiceResidentOption,
} from "@/components/portal/manager-create-service-request-modal";
import { ManagerCreateWorkOrderModal } from "@/components/portal/manager-create-work-order-modal";
import { filterEmailInboxThreads } from "@/lib/communication-inbox-filters";

/**
 * Routed resident detail tab panel — flat content (no collapsible chevron stack).
 */
function ResidentDetailTabPanel({
  headerAction,
  destructive,
  children,
}: {
  headerAction?: ReactNode;
  destructive?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4" data-slot="resident-detail-tab-panel">
      {headerAction || destructive ? (
        <PortalSectionActionRow destructive={destructive}>{headerAction}</PortalSectionActionRow>
      ) : null}
      {children}
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

export function ManagerResidents({
  tabId = "current",
  residentId: residentIdProp,
  detailTab: detailTabProp,
  smsUiEnabled = false,
}: {
  tabId?: ResidentsTabId;
  residentId?: string;
  detailTab?: ResidentDetailTabId;
  smsUiEnabled?: boolean;
}) {
  const { showToast } = useAppUi();
  const navigate = usePortalNavigate();
  const portalBase = usePaidPortalBasePath();
  const { userId, email: managerEmail, ready: authReady } = useManagerUserId();
  const {
    messages: scheduledPaymentMessages,
    settings: residentReminderSettings,
    reload: reloadResidentPaymentSchedule,
    setSettings: setResidentReminderSettings,
  } = useScheduledPaymentMessages({ includeHidden: true });
  const residentReminderScheduleSummary = useMemo(
    () => (residentReminderSettings ? formatFriendlyReminderSchedule(residentReminderSettings) : undefined),
    [residentReminderSettings],
  );
  const [hcTick, setHcTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const [leaseTick, setLeaseTick] = useState(0);
  const [workOrderTick, setWorkOrderTick] = useState(0);
  const [srTick, setSrTick] = useState(0);
  const [inboxTick, setInboxTick] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [residentsTab, setResidentsTab] = useState<ResidentsTabId>(tabId);
  const [prevTabId, setPrevTabId] = useState(tabId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [chargeBucket, setChargeBucket] = useState<ManagerPaymentBucket>("pending");
  const [residentReminderSettingsOpen, setResidentReminderSettingsOpen] = useState(false);
  const [prevSelectedId, setPrevSelectedId] = useState<string | null>(null);
  const [residentAccountEmails, setResidentAccountEmails] = useState<Set<string>>(new Set());
  const [uploadingLeaseRowId, setUploadingLeaseRowId] = useState<string | null>(null);
  const [generatingLeaseRowId, setGeneratingLeaseRowId] = useState<string | null>(null);
  const [regenerateConfirmLeaseId, setRegenerateConfirmLeaseId] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [messageScheduleLater, setMessageScheduleLater] = useState(false);
  const [messageSendAt, setMessageSendAt] = useState("");
  const [messageBusy, setMessageBusy] = useState(false);
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
  const [approvePreviewRow, setApprovePreviewRow] = useState<DemoApplicantRow | null>(null);
  const [checkrScreeningRowId, setCheckrScreeningRowId] = useState<string | null>(null);
  const [approveBusyId, setApproveBusyId] = useState<string | null>(null);

  // Services tab replica (Requests / Work orders — mirrors resident-services-panel.tsx)
  const [svcSubTab, setSvcSubTab] = useState<"requests" | "work-orders">("requests");
  const [svcReqBucket, setSvcReqBucket] = useState<ManagerServiceRequestBucket>("pending");
  const [svcWoBucket, setSvcWoBucket] = useState<ManagerWorkOrderBucket>("open");
  const [svcExpandedId, setSvcExpandedId] = useState<string | null>(null);

  const residentSmsPanelRef = useRef<ManagerSmsPanelHandle>(null);

  const activeDetailTab = parseResidentDetailTab(detailTabProp);
  const [applicationEditOpen, setApplicationEditOpen] = useState(false);
  const [addPaymentMethodOpen, setAddPaymentMethodOpen] = useState(false);
  const [addResidentPaymentOpen, setAddResidentPaymentOpen] = useState(false);
  const [addResidentRequestOpen, setAddResidentRequestOpen] = useState(false);
  const [addResidentWorkOrderOpen, setAddResidentWorkOrderOpen] = useState(false);
  const [pmPropertyId, setPmPropertyId] = useState("");
  const [pmZelleEnabled, setPmZelleEnabled] = useState(false);
  const [pmZelleContact, setPmZelleContact] = useState("");
  const [pmVenmoEnabled, setPmVenmoEnabled] = useState(false);
  const [pmVenmoContact, setPmVenmoContact] = useState("");
  const [pmAxisPaymentsEnabled, setPmAxisPaymentsEnabled] = useState(true);
  const [pmCardEnabled, setPmCardEnabled] = useState(true);
  const [pmConnectReady, setPmConnectReady] = useState<boolean | null>(null);
  const [pmPayoutSetupBusy, setPmPayoutSetupBusy] = useState(false);
  const [pmSaving, setPmSaving] = useState(false);

  // Add resident manually
  const [addResidentOpen, setAddResidentOpen] = useState(false);
  const [arName, setArName] = useState("");
  const [arEmail, setArEmail] = useState("");
  const [arPropertyId, setArPropertyId] = useState("");
  const [arRoomId, setArRoomId] = useState("");
  const [arLeaseTerm, setArLeaseTerm] = useState("");
  const [arLeaseTermCustomMode, setArLeaseTermCustomMode] = useState(false);
  const [arMoveInDate, setArMoveInDate] = useState("");
  const [arMoveOutDate, setArMoveOutDate] = useState("");
  const [arRent, setArRent] = useState("");
  const [arUtilities, setArUtilities] = useState("");
  const [arMoveInFee, setArMoveInFee] = useState("");
  const [arSecurityDeposit, setArSecurityDeposit] = useState("");
  const [arNotes, setArNotes] = useState("");
  const [arSendWelcome, setArSendWelcome] = useState(true);
  const [arSignedLeaseFileName, setArSignedLeaseFileName] = useState("");
  const [arSignedLeaseDataUrl, setArSignedLeaseDataUrl] = useState("");
  const [arSaving, setArSaving] = useState(false);

  // Edit resident
  const [editResidentOpen, setEditResidentOpen] = useState(false);
  const [erName, setErName] = useState("");
  const [erEmail, setErEmail] = useState("");
  const [erPropertyId, setErPropertyId] = useState("");
  const [erRoomId, setErRoomId] = useState("");
  const [erLeaseTerm, setErLeaseTerm] = useState("");
  const [erLeaseTermCustomMode, setErLeaseTermCustomMode] = useState(false);
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
    for (const ev of MANAGER_PORTFOLIO_REFRESH_EVENTS) {
      window.addEventListener(ev, bump);
    }
    return () => {
      for (const ev of MANAGER_PORTFOLIO_REFRESH_EVENTS) {
        window.removeEventListener(ev, bump);
      }
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
              isResidentDirectoryRow(row) &&
              row.email?.trim() &&
              applicationVisibleToPortalUser(row, userId, "residents"),
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
            .filter((row) => isResidentDirectoryRow(row) && !isPreviousResidentDirectoryRow(row))
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
    // `propertyTick` is a cache-invalidation signal, not a value read here:
    // `applicationVisibleToPortalUser` consults the module-level property
    // pipeline cache, which React cannot see. Re-filter once that cache
    // hydrates so linked-property rows appear without a manual refresh.
    void propertyTick;
    return readManagerApplicationRows()
      .filter((row) => isResidentDirectoryRow(row) && applicationVisibleToPortalUser(row, userId, "residents"))
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
          isPrevious: isPreviousResidentDirectoryRow(row),
        };
      });
  }, [userId, hcTick, propertyTick]);

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

  const arLeaseTermOptions = useMemo(
    () => residentLeaseTermOptionsForProperty(arPropertyId),
    [arPropertyId, propertyTick],
  );
  const arLeaseTermPresetValues = useMemo(
    () => arLeaseTermOptions.map((o) => o.value),
    [arLeaseTermOptions],
  );
  const erLeaseTermOptions = useMemo(
    () => residentLeaseTermOptionsForProperty(erPropertyId),
    [erPropertyId, propertyTick],
  );
  const erLeaseTermPresetValues = useMemo(
    () => erLeaseTermOptions.map((o) => o.value),
    [erLeaseTermOptions],
  );

  const arLeaseTermSelectValue = useMemo(
    () => residentLeaseTermSelectValue(arLeaseTerm, arLeaseTermCustomMode, arLeaseTermPresetValues),
    [arLeaseTerm, arLeaseTermCustomMode, arLeaseTermPresetValues],
  );

  const isMonthToMonthLease = isResidentMonthToMonthLease(arLeaseTerm);

  const arManualLeaseFields = useMemo(
    () => residentLeaseTermToApplicationFields(arLeaseTerm, arLeaseTermCustomMode),
    [arLeaseTerm, arLeaseTermCustomMode],
  );
  const arIsShortTermStay = arManualLeaseFields.rentalType === "short_term";

  useEffect(() => {
    if (!addResidentOpen) return;
    if (!arPropertyId.trim() || !arLeaseTerm.trim()) return;
    const pricing = resolveManualResidentPlacementValues({
      propertyId: arPropertyId,
      roomId: arRoomId,
      leaseTerm: arLeaseTerm,
      leaseTermCustomMode: arLeaseTermCustomMode,
    });
    if (!pricing) return;
    setArRent(pricing.rent);
    setArUtilities(pricing.utilities);
    setArMoveInFee(pricing.moveInFee);
    setArSecurityDeposit(pricing.securityDeposit);
  }, [addResidentOpen, arPropertyId, arRoomId, arLeaseTerm, arLeaseTermCustomMode, propertyTick]);

  useEffect(() => {
    if (!addResidentOpen) return;
    if (arManualLeaseFields.rentalType === "short_term") return;
    const term = arManualLeaseFields.leaseTerm;
    if (!arMoveInDate.trim() || !shouldAutoComputeLeaseEnd(term, arManualLeaseFields.rentalType)) return;
    const end = computeLeaseEndDate(arMoveInDate, term);
    if (end) setArMoveOutDate(end);
  }, [addResidentOpen, arMoveInDate, arLeaseTerm, arLeaseTermCustomMode, arManualLeaseFields.leaseTerm, arManualLeaseFields.rentalType]);

  const erLeaseTermSelectValue = useMemo(
    () => residentLeaseTermSelectValue(erLeaseTerm, erLeaseTermCustomMode, erLeaseTermPresetValues),
    [erLeaseTerm, erLeaseTermCustomMode, erLeaseTermPresetValues],
  );

  const isEditMonthToMonthLease = isResidentMonthToMonthLease(erLeaseTerm);

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
    const q = searchQuery.trim().toLowerCase();
    const searched = q
      ? base.filter((r) =>
          [r.name, r.email, r.roomLabel, r.propertyLabel, r.axisId]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : base;

    return [...searched].sort((a, b) => {
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
  }, [residents, residentsTab, propertyFilter, searchQuery]);

  const currentResidentsCount = useMemo(() => residents.filter((resident) => !resident.isPrevious).length, [residents]);
  const previousResidentsCount = useMemo(() => residents.filter((resident) => resident.isPrevious).length, [residents]);

  const selected = useMemo(() => residents.find((r) => r.id === selectedId) ?? null, [residents, selectedId]);

  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    if (selectedId) {
      setChargeBucket("pending");
      setSvcSubTab("requests");
      setSvcReqBucket("pending");
      setSvcWoBucket("open");
      setSvcExpandedId(null);
    }
  }

  useEffect(() => {
    if (!residentIdProp) return;
    const decoded = decodeURIComponent(residentIdProp);
    if (filtered.some((r) => r.id === decoded)) {
      setSelectedId(decoded);
      if (!portalUsesDesktopSplit()) setMobileDetailOpen(true);
    }
  }, [residentIdProp, filtered]);

  if (selectedId && !filtered.some((resident) => resident.id === selectedId)) {
    setSelectedId(null);
    setMobileDetailOpen(false);
  }

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      setMobileDetailOpen(false);
      return;
    }
    setSelectedId((cur) => {
      if (cur && filtered.some((r) => r.id === cur)) return cur;
      if (portalUsesDesktopSplit()) return filtered[0]!.id;
      return null;
    });
  }, [filtered]);

  useEffect(() => {
    setMobileDetailOpen(false);
    if (!portalUsesDesktopSplit()) setSelectedId(null);
  }, [residentsTab, propertyFilter, searchQuery]);

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
    return filterEmailInboxThreads(
      loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, [])
        .filter((thread) => thread.email.trim().toLowerCase() === email)
        .sort((a, b) => String(b.time).localeCompare(String(a.time))),
    );
  }, [selected, inboxTick]);

  const residentLedgerRows = useMemo(
    () => residentCharges.map((charge) => householdChargeToLedgerRow(charge)),
    [residentCharges],
  );

  const residentChargeCounts = useMemo(() => {
    const counts: Record<ManagerPaymentBucket, number> = { pending: 0, overdue: 0, paid: 0 };
    for (const row of residentLedgerRows) counts[row.bucket] += 1;
    return counts;
  }, [residentLedgerRows]);

  const residentLedgerRowsForBucket = useMemo(() => {
    const filtered = residentLedgerRows.filter((row) => row.bucket === chargeBucket);
    const direction = chargeBucket === "paid" ? "desc" : "asc";
    return [...filtered].sort((a, b) => compareDueDateMs(a.dueDateSortMs, b.dueDateSortMs, direction));
  }, [residentLedgerRows, chargeBucket]);

  const selectedApplicationRow = useMemo<DemoApplicantRow | null>(() => {
    void hcTick;
    if (!selected) return null;
    return readManagerApplicationRows().find((row) => row.id === selected.id) ?? null;
  }, [selected, hcTick]);

  const applicationGroups = useMemo(() => {
    void hcTick;
    return buildApplicationGroups(readManagerApplicationRows().map(groupRowInputForRow));
  }, [hcTick]);

  const selectedApplicationGroup = useMemo(() => {
    if (!selectedApplicationRow) return null;
    return groupForRow(applicationGroups, { groupId: groupIdForRow(selectedApplicationRow) });
  }, [applicationGroups, selectedApplicationRow]);

  // The resident's Application section is hidden for a LINKED (co-managed)
  // property when the co-manager lacks the `applications` grant on it. Own
  // properties always show it.
  const showResidentApplication = useMemo(() => {
    void hcTick;
    const pid = selected?.propertyId?.trim() || "";
    if (!userId || !pid) return true;
    if (!collectLinkedPropertyIds(userId).has(pid)) return true;
    return collectLinkedPropertyIdsForModule(userId, "applications").has(pid);
  }, [selected, userId, hcTick]);

  // Same gating for the resident's Lease section + Download lease button: hidden
  // on a LINKED property when the co-manager lacks the `leases` grant.
  const showResidentLease = useMemo(() => {
    void hcTick;
    const pid = selected?.propertyId?.trim() || "";
    if (!userId || !pid) return true;
    if (!collectLinkedPropertyIds(userId).has(pid)) return true;
    return collectLinkedPropertyIdsForModule(userId, "leases").has(pid);
  }, [selected, userId, hcTick]);

  const residentDetailTabsAvailable = useMemo((): ResidentDetailTabId[] => {
    const tabs: ResidentDetailTabId[] = [];
    if (showResidentApplication) tabs.push("application");
    if (showResidentLease) tabs.push("lease");
    tabs.push("payments", "services");
    return tabs;
  }, [showResidentApplication, showResidentLease]);

  const resolvedDetailTab = residentDetailTabsAvailable.includes(activeDetailTab)
    ? activeDetailTab
    : (residentDetailTabsAvailable[0] ?? "payments");

  const selectedServiceResident = useMemo<(ManagerServiceResidentOption & { assignedRoomChoice?: string }) | null>(() => {
    if (!selected?.email?.trim()) return null;
    const appRow = selectedApplicationRow;
    const assignedRoomChoice =
      appRow?.assignedRoomChoice?.trim() || appRow?.application?.roomChoice1?.trim() || "";
    return {
      residentEmail: selected.email.trim().toLowerCase(),
      residentName: selected.name.trim() || "Resident",
      propertyId: selected.propertyId.trim(),
      propertyLabel: selected.propertyLabel.trim() || "Property",
      roomLabel: selected.roomLabel.trim(),
      assignedRoomChoice: assignedRoomChoice || undefined,
    };
  }, [selected, selectedApplicationRow]);

  const canAddResidentServiceItem = Boolean(
    selectedServiceResident?.residentEmail && selectedServiceResident.propertyId,
  );

  const residentServiceRequestsCounts = useMemo(() => {
    const c: Record<ManagerServiceRequestBucket, number> = { pending: 0, approved: 0, denied: 0 };
    for (const req of residentServiceRequests) c[managerServiceRequestBucket(req.status)] += 1;
    return c;
  }, [residentServiceRequests]);

  const residentFilteredServiceRequests = useMemo(
    () =>
      residentServiceRequests
        .filter((req) => managerServiceRequestBucket(req.status) === svcReqBucket)
        .slice()
        .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()),
    [residentServiceRequests, svcReqBucket],
  );

  const residentWorkOrderCounts = useMemo(() => {
    const c: Record<ManagerWorkOrderBucket, number> = { open: 0, scheduled: 0, completed: 0 };
    for (const row of residentWorkOrders) c[row.bucket] += 1;
    return c;
  }, [residentWorkOrders]);

  const residentCommSummary = useMemo(() => {
    const live = residentInboxThreads.filter((t) => t.folder !== "trash");
    const unread = live.filter((t) => t.folder === "inbox" && t.unread).length;
    if (unread > 0) return `${unread} unread conversation${unread === 1 ? "" : "s"}`;
    if (live.length > 0) return `${live.length} conversation${live.length === 1 ? "" : "s"}`;
    return "No messages yet.";
  }, [residentInboxThreads]);

  async function sendResidentMessage() {
    if (!selected || messageBusy) return;
    const subject = messageSubject.trim();
    const body = messageBody.trim();
    if (!subject || !body) {
      showToast("Add a subject and message.");
      return;
    }

    if (messageScheduleLater) {
      const sendAt = new Date(messageSendAt);
      if (Number.isNaN(sendAt.getTime())) {
        showToast("Choose a valid send date and time.");
        return;
      }
      if (sendAt.getTime() < Date.now() - 60_000) {
        showToast("Send time must be in the future.");
        return;
      }
      setMessageBusy(true);
      try {
        const res = await fetch("/api/portal/scheduled-inbox-messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            subject,
            body,
            sendAt: sendAt.toISOString(),
            deliverViaEmail: true,
            recipientEmail: selected.email.trim().toLowerCase(),
            recipientName: selected.name.trim(),
          }),
        });
        if (!res.ok) {
          const payload = (await res.json()) as { error?: string };
          showToast(payload.error ?? "Could not schedule message.");
          return;
        }
        setMessageSubject("");
        setMessageBody("");
        setMessageScheduleLater(false);
        setMessageOpen(false);
        showToast("Message scheduled.");
      } finally {
        setMessageBusy(false);
      }
      return;
    }

    setMessageBusy(true);
    setMessageSubject("");
    setMessageBody("");
    setMessageScheduleLater(false);
    setMessageOpen(false);
    try {
      const result = await deliverPortalInboxMessage({
        eventCategory: "messages",
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
    } finally {
      setMessageBusy(false);
    }
  }

  function openResidentMessageModal() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    setMessageSendAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setMessageScheduleLater(false);
    setMessageOpen(true);
  }

  async function sendResidentAccountEmail(res: ActiveResident) {
    setWelcomeEmailBusyForResident(res.id);
    try {
      const endpoint = res.manuallyAdded
        ? "/api/portal/onboard-existing-resident"
        : "/api/portal/send-resident-welcome";
      const payload = res.manuallyAdded
        ? { applicationId: res.axisId, sendWelcomeEmail: true }
        : { to: res.email, residentName: res.name, axisId: res.axisId };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; mailtoHref?: string; welcomeEmailSent?: boolean };
      if (response.ok && data.ok) {
        showToast(res.manuallyAdded ? "Portal setup email sent." : "Account setup email sent.");
        return;
      }
      if (typeof data.mailtoHref === "string") {
        const { openMailtoHref } = await import("@/lib/resident-welcome-email");
        openMailtoHref(data.mailtoHref);
        const err = (data.error ?? "").toLowerCase();
        showToast(
          err.includes("not configured") || err.includes("resend_api_key")
            ? "Email provider not configured. Opened a draft in your mail app."
            : `Could not send automatically. Opened a draft in your mail app.`,
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
        showToast("Reminder sent to PropLane inbox (demo email, no external email sent).");
      } else {
        showToast("Lease-signing reminder sent via email and PropLane inbox.");
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
    const body = buildLeaseReadyForResidentMessage({
      residentName: res.name.split(" ")[0] ?? res.name,
      residentEmail: recipient,
      unit,
      variant: "reminder",
      dateLine,
    });

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
    return buildLeaseReadyForResidentMessage({
      residentName: lease.residentName || res.name || "there",
      residentEmail: res.email.trim(),
      unit,
      variant: "send",
    });
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
          eventCategory: "leases",
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

  const setApplicationBucket = async (
    id: string,
    nextBucket: ManagerApplicationBucket,
    opts?: { skipWelcomeEmail?: boolean },
  ) => {
    const result = await transitionApplicationBucket(id, nextBucket, {
      userId: userId ?? null,
      skipWelcomeEmail: opts?.skipWelcomeEmail,
    });
    if (!result) return;
    setHcTick((n) => n + 1);
    setLeaseTick((n) => n + 1);
    if (result.blocked) {
      showToast(result.message ?? "That change could not be saved.");
      return;
    }
    const msg =
      nextBucket === "approved"
        ? opts?.skipWelcomeEmail
          ? "Application approved (no setup email sent)."
          : result.welcomeSent
            ? "Application approved. A welcome email with portal setup was sent to the applicant."
            : "Application approved."
        : nextBucket === "rejected"
          ? "Application rejected."
          : "Moved to pending.";
    showToast(msg);
  };

  const handleScreeningUpdated = useCallback(() => {
    void syncManagerApplicationsFromServer({ force: true, managerUserId: userId }).then(() => setHcTick((n) => n + 1));
  }, [userId]);

  function saveManualResident() {
    void (async () => {
      if (arSaving) return;
      if (!arName.trim()) { showToast("Enter the resident's name."); return; }
      if (!arEmail.trim()) { showToast("Enter the resident's email."); return; }
      const rent = arRent.trim() ? Number(arRent.replace(/[^\d.]/g, "")) : null;
      const utilities = arUtilities.trim() ? Number(arUtilities.replace(/[^\d.]/g, "")) : null;
      const moveInFee = arMoveInFee.trim() ? Number(arMoveInFee.replace(/[^\d.]/g, "")) : null;
      const secDeposit = arSecurityDeposit.trim() ? Number(arSecurityDeposit.replace(/[^\d.]/g, "")) : null;
      const axisId = `PROPLANE-${Date.now().toString(36).toUpperCase().slice(-8)}`;
      const propLabel = arPropertyId
        ? (propertyOptions.find((p) => p.id === arPropertyId)?.label ?? arPropertyId)
        : "—";
      const selectedRoomLabel = arRoomId ? arRoomOptions.find((room) => room.id === arRoomId)?.name?.trim() ?? "" : "";
      const arAppLeaseFields = residentLeaseTermToApplicationFields(arLeaseTerm, arLeaseTermCustomMode);
      const signedLeaseUploadedAt = arSignedLeaseDataUrl.trim() ? new Date().toISOString() : undefined;
      const hasUploadedLeasePdf = Boolean(arSignedLeaseDataUrl.trim());
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
          leaseTerm: arLeaseTerm.trim() || undefined,
          notes: arNotes.trim() || undefined,
          signedLeaseFileName: arSignedLeaseFileName.trim() || undefined,
          signedLeaseDataUrl: arSignedLeaseDataUrl.trim() || undefined,
          signedLeaseUploadedAt,
          ...(hasUploadedLeasePdf ? { externallySignedLease: true as const } : {}),
        },
        application: arAppLeaseFields.leaseTerm
          ? // Manual add-resident supplies only the lease-relevant fields; the rest of the
            // wizard form state is not collected here (cast keeps this intentional partial).
            ({
              propertyId: arPropertyId || undefined,
              roomChoice1: arPropertyId && arRoomId ? `${arPropertyId}${LISTING_ROOM_CHOICE_SEP}${arRoomId}` : undefined,
              leaseTerm: arAppLeaseFields.leaseTerm,
              rentalType: arAppLeaseFields.rentalType,
              leaseStart: arMoveInDate || undefined,
              leaseEnd: arMoveOutDate || undefined,
              fullLegalName: arName.trim(),
              email: arEmail.trim(),
            } as unknown as DemoApplicantRow["application"])
          : undefined,
      };
      setArSaving(true);
      try {
        appendManagerApplicationRow(nextRow, { skipServerMirror: true });
        const persisted = await upsertApplicationRowToServerAwait(nextRow, {
          existingResidentOnboarding: { sendWelcomeEmail: arSendWelcome },
        });
        if (!persisted.ok) {
          if (persisted.mailtoHref) {
            const { openMailtoHref } = await import("@/lib/resident-welcome-email");
            openMailtoHref(persisted.mailtoHref);
          }
          showToast(persisted.error ?? "Could not complete resident onboarding.");
          return;
        }
        recordApprovedApplicationCharges(nextRow, userId ?? null, true);
        syncLeasePipelineFromApplications(userId ?? null);

        showToast(
          persisted.welcomeEmailSent
            ? `Resident added. Portal setup email sent to ${arEmail.trim()}.`
            : `Resident added. PropLane ID: ${axisId}`,
        );

        await Promise.all([
          syncManagerApplicationsFromServer({ force: true, managerUserId: userId }),
          syncLeasePipelineFromServer(userId ?? null, { force: true }),
          syncHouseholdChargesFromServer(true),
        ]);
        setChargeBucket("pending");
        setArName(""); setArEmail(""); setArPropertyId(""); setArRoomId(""); setArLeaseTerm(""); setArLeaseTermCustomMode(false);
        setArMoveInDate(""); setArMoveOutDate(""); setArRent(""); setArUtilities("");
        setArMoveInFee(""); setArSecurityDeposit(""); setArNotes("");
        setArSignedLeaseFileName(""); setArSignedLeaseDataUrl(""); setArSendWelcome(true);
        setAddResidentOpen(false);
        setHcTick((n) => n + 1);
        setLeaseTick((n) => n + 1);
      } finally {
        setArSaving(false);
      }
    })();
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
    const assignedPropIdForLease = assignedPropId;
    const storedLeaseTerm = row.manualResidentDetails?.leaseTerm || app?.leaseTerm || "";
    const erDisplayLeaseTerm = listingLeaseTermToResidentValue(storedLeaseTerm) || storedLeaseTerm;
    const erOpts = residentLeaseTermOptionsForProperty(assignedPropIdForLease).map((o) => o.value);
    setErLeaseTerm(erDisplayLeaseTerm);
    setErLeaseTermCustomMode(shouldUseResidentLeaseCustomMode(erDisplayLeaseTerm, erOpts));
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

    const appLeaseFields = residentLeaseTermToApplicationFields(erLeaseTerm, erLeaseTermCustomMode);
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
        leaseTerm: erLeaseTerm.trim() || undefined,
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
            leaseTerm: appLeaseFields.leaseTerm || existing.application.leaseTerm,
            rentalType: appLeaseFields.leaseTerm ? appLeaseFields.rentalType : existing.application.rentalType,
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
    recordApprovedApplicationCharges(nextRow, userId ?? null, true);

    // Auto-regenerate any unsigned leases so room/rent/rules changes are reflected immediately
    if (residentEmail && nextRow.application) {
      regenerateEditableLeasesForResident(residentEmail, userId, nextRow.application);
    }

    setEditResidentOpen(false);
    setHcTick((n) => n + 1);
    showToast("Resident updated.");
  }

  function openPaymentMethodEditor() {
    if (!selected) return;
    const propId = selected.propertyId?.trim() || "";
    setPmPropertyId(propId);
    const listing = propId && userId ? readExtraListingsForUser(userId).find((p) => p.id === propId) : undefined;
    const sub = listing?.listingSubmission ? normalizeManagerListingSubmissionV1(listing.listingSubmission) : null;
    setPmZelleEnabled(Boolean(sub?.zellePaymentsEnabled));
    setPmZelleContact(sub?.zelleContact ?? "");
    setPmVenmoEnabled(Boolean(sub?.venmoPaymentsEnabled));
    setPmVenmoContact(sub?.venmoContact ?? "");
    const accepted = acceptedPaymentMethodsForListing(sub);
    setPmAxisPaymentsEnabled(sub?.axisPaymentsEnabled !== false && accepted.includes("ach"));
    setPmCardEnabled(sub?.axisPaymentsEnabled !== false && accepted.includes("card"));
    setPmConnectReady(null);
    setAddPaymentMethodOpen(true);
    if (isDemoModeActive()) {
      setPmConnectReady(true);
      return;
    }
    void fetch("/api/stripe/connect/status", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          setPmConnectReady(false);
          return;
        }
        const body = (await res.json()) as { paymentReady?: boolean; payoutsEnabled?: boolean; transfersEnabled?: boolean };
        setPmConnectReady(Boolean(body.paymentReady ?? (body.payoutsEnabled && body.transfersEnabled)));
      })
      .catch(() => setPmConnectReady(false));
  }

  async function savePaymentMethodSettings() {
    if (!userId || !pmPropertyId) {
      showToast("This resident isn't linked to a property yet.");
      return;
    }
    const zelleContact = sanitizePaymentContactInput(pmZelleContact).trim();
    const venmoContact = sanitizePaymentContactInput(pmVenmoContact).trim();
    if (pmZelleEnabled && !zelleContact) {
      showToast("Enter a Zelle phone or email, or turn Zelle off.");
      return;
    }
    if (pmVenmoEnabled && !venmoContact) {
      showToast("Enter a Venmo username, phone, or email, or turn Venmo off.");
      return;
    }
    if (!pmZelleEnabled && !pmVenmoEnabled && !pmAxisPaymentsEnabled && !pmCardEnabled) {
      showToast("Enable at least one payment method.");
      return;
    }
    // Scoped to this manager's own properties only — readExtraListingsForUser(userId) can never
    // resolve a listing owned by another manager, and the server re-checks ownership on write.
    const listing = readExtraListingsForUser(userId).find((p) => p.id === pmPropertyId);
    if (!listing?.listingSubmission) {
      showToast("Could not find this property's payment settings.");
      return;
    }
    setPmSaving(true);
    const acceptedPaymentMethods = [
      ...(pmZelleEnabled && zelleContact ? (["zelle"] as const) : []),
      ...(pmVenmoEnabled && venmoContact ? (["venmo"] as const) : []),
      ...(pmAxisPaymentsEnabled ? (["ach"] as const) : []),
      ...(pmCardEnabled ? (["card"] as const) : []),
    ];
    const stripeEnabled = pmAxisPaymentsEnabled || pmCardEnabled;
    const nextSubmission = {
      ...normalizeManagerListingSubmissionV1(listing.listingSubmission),
      zellePaymentsEnabled: pmZelleEnabled,
      zelleContact,
      venmoPaymentsEnabled: pmVenmoEnabled,
      venmoContact,
      axisPaymentsEnabled: stripeEnabled,
      applicationFeeStripeEnabled: stripeEnabled ? true : undefined,
      acceptedPaymentMethods: [...acceptedPaymentMethods],
    };
    const ok = await updateExtraListingFromSubmissionOnServer(pmPropertyId, userId, nextSubmission);
    setPmSaving(false);
    if (!ok) {
      showToast("Could not save payment methods. Try again.");
      return;
    }
    setPropertyTick((n) => n + 1);
    showToast("Payment methods saved.");
    setAddPaymentMethodOpen(false);
  }

  function goToPayoutSetup() {
    if (pmPayoutSetupBusy) return;
    setPmPayoutSetupBusy(true);
    void openStripeConnectOnboarding({ showToast }).then((opened) => {
      setPmPayoutSetupBusy(false);
      if (!opened) return;
      const refresh = () => {
        if (isDemoModeActive()) {
          setPmConnectReady(true);
          return;
        }
        void fetch("/api/stripe/connect/status", { credentials: "include", cache: "no-store" })
          .then(async (res) => {
            if (!res.ok) {
              setPmConnectReady(false);
              return;
            }
            const body = (await res.json()) as { paymentReady?: boolean; payoutsEnabled?: boolean; transfersEnabled?: boolean };
            setPmConnectReady(Boolean(body.paymentReady ?? (body.payoutsEnabled && body.transfersEnabled)));
          })
          .catch(() => setPmConnectReady(false));
      };
      window.addEventListener("message", function onMsg(e: MessageEvent) {
        if (e.origin !== window.location.origin) return;
        if (e.data?.type !== "axis-stripe-connect") return;
        refresh();
        window.removeEventListener("message", onMsg);
      });
      window.addEventListener("axis-stripe-connect-refresh", refresh, { once: true });
    });
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
    if (residentLeases.length > 0) {
      deleteLeasePipelineRowsForResident(selectedResident.email, selectedResident.id, userId);
    }

    const residentWorkOrders = readManagerWorkOrderRows().filter(
      (row) => row.residentEmail?.trim().toLowerCase() === residentEmail,
    );
    for (const workOrder of residentWorkOrders) {
      deleteManagerWorkOrderRow(workOrder.id);
    }

    deleteServiceRequestsForResident(selectedResident.email);
    clearUploadedOwnLease(selectedResident.email);

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

  async function handleManagerModalSign(signatureName: string, consentVersion: string) {
    if (!signingLease) return false;
    const ok = await managerSignLease(signingLease.id, signatureName.trim(), userId, consentVersion);
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
                            {selected ? (
                              <DestinationNav
                                items={(
                                  [
                                    showResidentApplication ? "application" : null,
                                    showResidentLease ? "lease" : null,
                                    "payments",
                                    "services",
                                  ] as const
                                )
                                  .filter((tab): tab is ResidentDetailTabId => tab !== null)
                                  .map((tab) => ({
                                    id: tab,
                                    label: RESIDENT_DETAIL_TAB_LABELS[tab],
                                    href: residentDetailHref(portalBase, residentsTab, selected.id, tab),
                                    dataAttr: `resident-detail-tab-${tab}`,
                                  }))}
                                activeId={resolvedDetailTab}
                                ariaLabel="Resident profile sections"
                              />
                            ) : null}
                            <div className="rounded-2xl border border-border bg-card p-4 [html[data-native]_&]:p-3">
                              <PortalSectionActionRow
                                destructive={
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className={`${RESIDENT_DETAIL_HEADER_ACTION_BTN} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)]`}
                                    onClick={deleteSelectedResident}
                                  >
                                    Delete
                                  </Button>
                                }
                              >
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={`${RESIDENT_DETAIL_HEADER_ACTION_BTN} bg-primary/[0.06] text-primary hover:bg-primary/[0.12]`}
                                  onClick={() => {
                                    const signupUrl = residentAccountCreationUrl(window.location.origin, selected.axisId);
                                    const previewBody = buildResidentWelcomeEmailBody({ residentName: selected.name, axisId: selected.axisId, signupUrl });
                                    setWelcomePreviewContent(previewBody);
                                    setWelcomePreviewFor(selected);
                                  }}
                                >
                                  Email setup
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={RESIDENT_DETAIL_HEADER_ACTION_BTN}
                                  onClick={openEditResidentModal}
                                >
                                  Edit
                                </Button>
                              </PortalSectionActionRow>
                            </div>

                            {showResidentApplication && resolvedDetailTab === "application" ? (
                            <ResidentDetailTabPanel
                              headerAction={
                                selectedApplicationRow ? (
                                  selectedApplicationRow.bucket === "pending" ? (
                                    <>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className={RESIDENT_DETAIL_HEADER_ACTION_BTN}
                                        data-attr="resident-application-reject"
                                        onClick={() => void setApplicationBucket(selectedApplicationRow.id, "rejected")}
                                      >
                                        Reject
                                      </Button>
                                      {isWithdrawnApplicationRow(selectedApplicationRow) ? null : (
                                        <Button
                                          type="button"
                                          variant="primary"
                                          className={RESIDENT_DETAIL_HEADER_ACTION_BTN}
                                          data-attr="resident-application-approve"
                                          onClick={() => setApprovePreviewRow(selectedApplicationRow)}
                                        >
                                          Approve
                                        </Button>
                                      )}
                                    </>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className={RESIDENT_DETAIL_HEADER_ACTION_BTN}
                                      data-attr="resident-application-move-pending"
                                      onClick={() => void setApplicationBucket(selectedApplicationRow.id, "pending")}
                                    >
                                      To pending
                                    </Button>
                                  )
                                ) : undefined
                              }
                              destructive={
                                selectedApplicationRow ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className={`${RESIDENT_DETAIL_HEADER_ACTION_BTN} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)] portal-danger-outline`}
                                    data-attr="resident-application-delete"
                                    onClick={() => void deleteSelectedResident()}
                                  >
                                    Delete
                                  </Button>
                                ) : undefined
                              }
                            >
                              {selectedApplicationRow ? (
                                <div className="space-y-8">
                                  {selectedApplicationGroup ? (
                                    <ApplicationGroupSection
                                      group={selectedApplicationGroup}
                                      currentRowId={selectedApplicationRow.id}
                                    />
                                  ) : null}
                                  <ApplicationDocumentPreview row={selectedApplicationRow} />
                                  <ApplicationScreeningPanel
                                    row={selectedApplicationRow}
                                    onUpdated={handleScreeningUpdated}
                                    onOpenScreeningModal={() => setCheckrScreeningRowId(selectedApplicationRow.id)}
                                  />
                                </div>
                              ) : (
                                <p className="text-sm text-muted">No application on file for this resident.</p>
                              )}
                            </ResidentDetailTabPanel>
                            ) : null}

                            {showResidentLease && resolvedDetailTab === "lease" ? (
                            <ResidentDetailTabPanel>
                              {residentLease ? (
                                <LeasePrimaryHeaderActions
                                    row={residentLease}
                                    downloadDataAttr="resident-lease-download"
                                    signManagerDataAttr="resident-lease-sign-manager"
                                    signingReminderDataAttr="resident-lease-signing-reminder"
                                    deleteDataAttr="resident-lease-delete"
                                    onDownload={() => {
                                      if (residentLease.managerUploadedPdf?.dataUrl) {
                                        downloadLeaseFromRow(residentLease);
                                      } else if (residentLease.generatedHtml) {
                                        printLeaseAsPdf(residentLease);
                                      }
                                      showToast("Lease download started.");
                                    }}
                                    onSignManager={() => signLeaseAsManager(residentLease)}
                                    onSigningReminder={() => openLeaseSigningReminderPreview(selected, residentLease)}
                                    signingReminderBusy={leaseReminderBusy}
                                    sendToResidentDataAttr="resident-lease-send"
                                    moveToManagerReviewDataAttr="resident-lease-move-manager-review"
                                    onSendToResident={() => openLeaseSendPreview(selected, residentLease)}
                                    sendToResidentBusy={leaseSendBusy}
                                    sendToResidentDisabled={
                                      !residentAccountEmails.has(selected.email.trim().toLowerCase()) ||
                                      (!residentLease.generatedHtml && !residentLease.managerUploadedPdf?.dataUrl)
                                    }
                                    onMoveToManagerReview={() => {
                                      const moveResult = sendLeaseBackToManager(residentLease.id, userId);
                                      if (!moveResult.ok) {
                                        showToast(moveResult.error);
                                        return;
                                      }
                                      appendLeaseThreadMessage(
                                        residentLease.id,
                                        "manager",
                                        "Moved lease back to manager review.",
                                        userId,
                                      );
                                      setLeaseTick((n) => n + 1);
                                      showToast("Lease moved to Manager Review.");
                                    }}
                                    onDelete={() => {
                                      if (
                                        !window.confirm(
                                          `Delete the lease document for ${selected.name}? Generate or upload can recreate it.`,
                                        )
                                      ) {
                                        return;
                                      }
                                      if (deleteLeasePipelineRow(residentLease.id, userId)) {
                                        setLeaseTick((n) => n + 1);
                                        showToast("Lease document deleted.");
                                      } else {
                                        showToast("Could not delete lease document.");
                                      }
                                    }}
                                  />
                              ) : null}
                              {residentLease ? (
                                <>
                                  <PortalTableDetailActions placement="top">
                                    {leaseAllowsManagerDocumentEdits(residentLease) ? (
                                      <>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          className={PORTAL_DETAIL_BTN}
                                          disabled={
                                            generatingLeaseRowId === residentLease.id ||
                                            !leaseGenerationSupportedForRow(residentLease).ok
                                          }
                                          title={leaseGenerationGateTitle(residentLease)}
                                          onClick={() => openGenerateLeaseConfirm(residentLease.id)}
                                        >
                                          {generatingLeaseRowId === residentLease.id ? "Generating..." : "Generate lease"}
                                        </Button>
                                        <label
                                          className={`inline-flex cursor-pointer items-center ${PORTAL_DETAIL_BTN} hover:bg-accent/30`}
                                        >
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
                                  </PortalTableDetailActions>
                                  <LeaseDocumentPreview
                                    row={residentLease}
                                    suppressApplicationDraft={Boolean(selected.manuallyAdded)}
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
                                </>
                              ) : (
                                <p className="text-sm text-muted">Approve the application and create or generate a lease here for this resident.</p>
                              )}
                            </ResidentDetailTabPanel>
                            ) : null}

                            {resolvedDetailTab === "payments" ? (
                            <ResidentDetailTabPanel
                              headerAction={
                                <>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className={RESIDENT_DETAIL_HEADER_ACTION_BTN}
                                    onClick={() => setResidentReminderSettingsOpen(true)}
                                    data-attr="resident-payments-reminder-settings"
                                  >
                                    Reminders
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className={RESIDENT_DETAIL_HEADER_ACTION_BTN}
                                    onClick={openPaymentMethodEditor}
                                    data-attr="resident-payment-method-open"
                                  >
                                    Pay method
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="primary"
                                    className={RESIDENT_DETAIL_HEADER_ACTION_BTN}
                                    onClick={() => setAddResidentPaymentOpen(true)}
                                    data-attr="resident-add-payment"
                                  >
                                    Add
                                  </Button>
                                </>
                              }
                            >
                              <ManagerPortalStatusFilterRow className="mt-3">
                                <ManagerPortalStatusPills
                                  tabs={[
                                    { id: "pending", label: "Pending", count: residentChargeCounts.pending },
                                    { id: "overdue", label: "Overdue", count: residentChargeCounts.overdue },
                                    { id: "paid", label: "Paid", count: residentChargeCounts.paid },
                                  ]}
                                  activeId={chargeBucket}
                                  onChange={(id) => setChargeBucket(id as ManagerPaymentBucket)}
                                />
                              </ManagerPortalStatusFilterRow>
                              <ManagerPaymentsLedgerPanel
                                rows={residentLedgerRowsForBucket}
                                managerUserId={userId ?? null}
                                activeBucket={chargeBucket}
                                scheduledMessages={scheduledPaymentMessages}
                                reminderScheduleSummary={residentReminderScheduleSummary}
                                onOpenReminderSettings={() => setResidentReminderSettingsOpen(true)}
                                onScheduleChanged={() => void reloadResidentPaymentSchedule()}
                                onRowsChanged={() => setHcTick((n) => n + 1)}
                              />
                            </ResidentDetailTabPanel>
                            ) : null}

                            {resolvedDetailTab === "services" ? (
                            <ResidentDetailTabPanel
                              headerAction={
                                <Button
                                  type="button"
                                  variant="primary"
                                  className={PORTAL_HEADER_ACTION_BTN}
                                  data-attr={svcSubTab === "requests" ? "resident-add-service-request" : "resident-add-work-order"}
                                  disabled={!canAddResidentServiceItem}
                                  title={
                                    canAddResidentServiceItem
                                      ? undefined
                                      : "Link this resident to a property before adding services."
                                  }
                                  onClick={() => {
                                    if (svcSubTab === "requests") setAddResidentRequestOpen(true);
                                    else setAddResidentWorkOrderOpen(true);
                                  }}
                                >
                                  Add
                                </Button>
                              }
                            >
                              <div className="mb-4">
                                <RadixSegmentedTabs
                                  items={[
                                    { id: "requests", label: "Add-on services" },
                                    { id: "work-orders", label: "Work orders" },
                                  ]}
                                  activeId={svcSubTab}
                                  onChange={(id) => {
                                    setSvcSubTab(id as "requests" | "work-orders");
                                    setSvcExpandedId(null);
                                  }}
                                  ariaLabel="Resident services type"
                                />
                              </div>

                              {svcSubTab === "requests" ? (
                                <div>
                                  <div className="mb-3">
                                    <ManagerPortalStatusPills
                                      tabs={(
                                        ["pending", "approved", "denied"] as const
                                      ).map((id) => ({
                                        id,
                                        label: id === "pending" ? "Pending" : id === "approved" ? "Approved" : "Denied",
                                        count: residentServiceRequestsCounts[id],
                                      }))}
                                      activeId={svcReqBucket}
                                      onChange={(id) => setSvcReqBucket(id as ManagerServiceRequestBucket)}
                                    />
                                  </div>
                                  {residentServiceRequests.length === 0 ? (
                                    <PortalDataTableEmpty message="No add-on services requested yet." icon="service" />
                                  ) : residentFilteredServiceRequests.length === 0 ? (
                                    <PortalDataTableEmpty message="No add-on services in this status yet." icon="service" />
                                  ) : (
                                    <div className={`mt-3 ${PORTAL_DATA_TABLE_WRAP}`}>
                                      <div className={`${PORTAL_DATA_TABLE_SCROLL} overflow-x-auto`}>
                                        <table className="w-full min-w-[28rem] table-fixed border-collapse text-left text-sm lg:min-w-0">
                                          <thead>
                                            <tr className={PORTAL_TABLE_HEAD_ROW}>
                                              <th className={`${MANAGER_TABLE_TH} hidden text-left sm:table-cell`}>Type</th>
                                              <th className={`${MANAGER_TABLE_TH} text-left`}>Item</th>
                                              <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                                              <th className={`${MANAGER_TABLE_TH} hidden text-left sm:table-cell`}>Charges</th>
                                              <th className={PORTAL_TABLE_EXPAND_TH}>
                                                <span className="sr-only">Expand</span>
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {residentFilteredServiceRequests.map((req) => {
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
                                                    <td className={`${PORTAL_TABLE_TD} hidden text-muted sm:table-cell`}>Request</td>
                                                    <td className={`${PORTAL_TABLE_TD} min-w-0 font-medium text-foreground`}>
                                                      <span className="block text-xs text-muted sm:hidden">Request</span>
                                                      <span className="break-words">{req.offerName}</span>
                                                    </td>
                                                    <td className={PORTAL_TABLE_TD}>
                                                      <ServiceStatusBadge status={req.status} />
                                                    </td>
                                                    <td className={`${PORTAL_TABLE_TD} hidden sm:table-cell`}>
                                                      {managerServiceRequestPricingSummary(req)}
                                                    </td>
                                                    <PortalTableExpandCell expanded={svcExpandedId === rowId} />
                                                  </tr>
                                                  {svcExpandedId === rowId ? (
                                                    <tr className={PORTAL_TABLE_DETAIL_ROW}>
                                                      <td colSpan={5} className={PORTAL_TABLE_DETAIL_CELL}>
                                                        <ManagerServiceRequestDetail
                                                          req={req}
                                                          propertyLabel={selected.propertyLabel || "—"}
                                                          onUpdated={() => setSrTick((n) => n + 1)}
                                                          onApproved={() => setSvcReqBucket("approved")}
                                                          onDenied={() => setSvcReqBucket("denied")}
                                                          onCollapsed={() => setSvcExpandedId(null)}
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
                                  <div className="mb-3 w-fit max-w-full">
                                    <ManagerPortalStatusPills
                                      tabs={(
                                        ["open", "scheduled", "completed"] as const
                                      ).map((id) => ({
                                        id,
                                        label: id === "open" ? "Pending" : id === "scheduled" ? "Scheduled" : "Completed",
                                        count: residentWorkOrderCounts[id],
                                      }))}
                                      activeId={svcWoBucket}
                                      onChange={(id) => setSvcWoBucket(id as ManagerWorkOrderBucket)}
                                    />
                                  </div>
                                  <ManagerWorkOrdersPanel
                                    allRows={residentWorkOrders}
                                    bucket={svcWoBucket}
                                    onAfterSchedule={() => setSvcWoBucket("scheduled")}
                                  />
                                </div>
                              )}
                              <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Communication</p>
                                    <p className="mt-1 text-sm text-muted">{residentCommSummary}</p>
                                  </div>
                                  <PortalSectionActionRow>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-full px-3 py-1 text-xs"
                                      onClick={openResidentMessageModal}
                                    >
                                      New message
                                    </Button>
                                  </PortalSectionActionRow>
                                </div>
                                <ManagerResidentDetailInbox
                                  residentEmail={selected.email}
                                  portalBase={portalBase}
                                  smsUiEnabled={smsUiEnabled}
                                  smsRef={residentSmsPanelRef}
                                />
                              </div>
                            </ResidentDetailTabPanel>
                            ) : null}
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
          onSign={handleManagerModalSign}
          onClose={() => setSigningLease(null)}
        />
      ) : null}
      <ManagerPortalPageShell
        title="Residents"
        compactFilterRow
        mobileHideFilterRow={mobileDetailOpen}
        mobileFlush={mobileDetailOpen}
      >
      <PortalListControlStack
        className="mb-3"
        filterRow={
          <PortalFilterSortSheet
            activeCount={portalFilterActiveCount([propertyFilter])}
            onReset={() => setPropertyFilter("")}
            dataAttr="residents-filter-sheet-open"
          >
            <PortalPropertyFilterPill
              propertyOptions={propertyOptions}
              propertyValue={propertyFilter}
              onPropertyChange={setPropertyFilter}
            />
          </PortalFilterSortSheet>
        }
        primaryAction={
          <PortalSectionActionRow>
            <Button type="button" variant="primary" className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`} onClick={() => setAddResidentOpen(true)}>
              + Add
            </Button>
          </PortalSectionActionRow>
        }
        destinations={[
          {
            id: "current",
            label: "Current",
            href: `${portalBase}/residents/current`,
            count: currentResidentsCount,
            dataAttr: "residents-tab-current",
          },
          {
            id: "previous",
            label: "Previous",
            href: `${portalBase}/residents/previous`,
            count: previousResidentsCount,
            dataAttr: "residents-tab-previous",
          },
        ]}
        activeDestinationId={residentsTab}
        destinationAriaLabel="Resident directory"
        search={{
          value: searchQuery,
          onChange: setSearchQuery,
          placeholder: "Search residents",
          dataAttr: "residents-search",
        }}
      />
      {filtered.length === 0 ? (
        <>
          <PortalDataTableEmpty
            icon="residents"
            message={
              residents.length === 0
                ? "No residents yet."
                : searchQuery.trim()
                  ? "No residents match your search."
                  : residentsTab === "current"
                    ? "No current residents yet."
                    : "No previous residents yet."
            }
          />
        </>
      ) : (
        <PortalListDetailPane
          mobileCompact
          className="max-md:rounded-xl max-md:shadow-[var(--shadow-sm)]"
          detailOpen={mobileDetailOpen && Boolean(selected)}
          list={
            <div className="flex min-h-0 flex-1 flex-col">
              <div className={INBOX_LIST_SCROLL}>
                {filtered.map((res) => {
                  const housingLabel = [res.roomLabel, !propertyFilter ? res.propertyLabel : null]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <PortalPersonRecordRow
                      key={res.id}
                      name={res.name || "—"}
                      subtitle={housingLabel || undefined}
                      preview={res.email || housingLabel || " "}
                      meta={res.leaseStart ? shortDateLabel(res.leaseStart) : undefined}
                      selected={selectedId === res.id}
                      onOpen={() => {
                        setSelectedId(res.id);
                        setMobileDetailOpen(true);
                        navigate(residentDetailHref(portalBase, residentsTab, res.id, resolvedDetailTab));
                      }}
                      dataAttr="resident-list-row"
                    />
                  );
                })}
              </div>
            </div>
          }
          detail={
            selected ? (
              <div className="flex h-full min-h-0 flex-col">
                <PortalDetailHeader
                  title={selected.name || "Resident"}
                  subtitle={selected.email || undefined}
                  avatarName={selected.name || selected.email}
                  onBack={() => setMobileDetailOpen(false)}
                  backLabel="Back to residents"
                  dataAttrBack="resident-detail-back"
                />
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 [-webkit-overflow-scrolling:touch] md:px-3 md:py-3">
                  {residentDetailPanel}
                </div>
              </div>
            ) : (
              <PortalListDetailPlaceholder
                title="Select a resident"
                hint="Choose someone from the list to view their profile, lease, and payments."
              />
            )
          }
        />
      )}

      <ReminderSettingsModal
        open={residentReminderSettingsOpen}
        onClose={() => setResidentReminderSettingsOpen(false)}
        settings={residentReminderSettings}
        onSaved={(next) => {
          setResidentReminderSettings(next);
          void reloadResidentPaymentSchedule();
          setResidentReminderSettingsOpen(false);
        }}
      />
      <ManagerAddPaymentModal
        open={addResidentPaymentOpen}
        onClose={() => setAddResidentPaymentOpen(false)}
        managerUserId={userId ?? null}
        initialApplicationId={selected?.id}
        initialPropertyId={selected?.propertyId}
        onSubmitted={() => {
          setAddResidentPaymentOpen(false);
          setHcTick((n) => n + 1);
          if (selected?.email) {
            regenerateEditableLeasesForResident(selected.email, userId);
          }
        }}
      />

      <ManagerCreateServiceRequestModal
        open={addResidentRequestOpen}
        onClose={() => setAddResidentRequestOpen(false)}
        managerUserId={userId ?? null}
        defaultResident={selectedServiceResident}
        onSubmitted={() => {
          setAddResidentRequestOpen(false);
          setSrTick((n) => n + 1);
          setHcTick((n) => n + 1);
          setSvcReqBucket("pending");
        }}
      />

      <ManagerCreateWorkOrderModal
        open={addResidentWorkOrderOpen}
        onClose={() => setAddResidentWorkOrderOpen(false)}
        managerUserId={userId ?? null}
        defaultResident={selectedServiceResident}
        onSubmitted={(bucket) => {
          setAddResidentWorkOrderOpen(false);
          setWorkOrderTick((n) => n + 1);
          setHcTick((n) => n + 1);
          setSvcWoBucket(bucket);
        }}
      />

      <Modal open={addPaymentMethodOpen} title="Payment methods" onClose={() => setAddPaymentMethodOpen(false)}>
        <div className="space-y-4 text-sm">
          <p className="text-muted">
            {selected?.name ?? "This resident"}{" "}
            chooses how to pay (bank/ACH, card, or Link) each time they check out a charge. The methods below apply to{" "}
            {selected?.propertyLabel?.trim() || "this resident's property"}{" "}
            and are the same settings shown under that property&apos;s payment settings in Properties. Editing here
            updates them there too.
          </p>
          {!pmPropertyId ? (
            <p className="rounded-xl border border-border bg-accent/30 px-3 py-2 text-xs text-muted">
              This resident isn&apos;t linked to a property yet, so payment methods can&apos;t be edited here.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2 rounded-xl border border-border bg-card p-4">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 rounded border-border"
                    checked={pmZelleEnabled}
                    onChange={(e) => setPmZelleEnabled(e.target.checked)}
                    data-attr="resident-payment-zelle-toggle"
                  />
                  <span className="text-sm font-medium text-foreground">Zelle</span>
                </label>
                {pmZelleEnabled ? (
                  <div className="pl-7">
                    <label className="text-xs font-semibold text-muted">Zelle phone or email</label>
                    <Input
                      className="mt-1"
                      value={pmZelleContact}
                      onChange={(e) => setPmZelleContact(sanitizePaymentContactInput(e.target.value))}
                      placeholder="+1 555 010 8899 or name@email.com"
                      data-attr="resident-payment-zelle-contact-input"
                    />
                  </div>
                ) : null}
              </div>
              <div className="space-y-2 rounded-xl border border-border bg-card p-4">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 rounded border-border"
                    checked={pmVenmoEnabled}
                    onChange={(e) => setPmVenmoEnabled(e.target.checked)}
                    data-attr="resident-payment-venmo-toggle"
                  />
                  <span className="text-sm font-medium text-foreground">Venmo</span>
                </label>
                {pmVenmoEnabled ? (
                  <div className="pl-7">
                    <label className="text-xs font-semibold text-muted">Venmo username, phone, or email</label>
                    <Input
                      className="mt-1"
                      value={pmVenmoContact}
                      onChange={(e) => setPmVenmoContact(sanitizePaymentContactInput(e.target.value))}
                      placeholder="@username, +1 555 010 8899, or name@email.com"
                      data-attr="resident-payment-venmo-contact-input"
                    />
                  </div>
                ) : null}
              </div>
              <div className="space-y-2 rounded-xl border border-border bg-card p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
                    checked={pmAxisPaymentsEnabled}
                    onChange={(e) => setPmAxisPaymentsEnabled(e.target.checked)}
                    data-attr="resident-payment-axis-ach-toggle"
                  />
                  <span className="text-sm font-medium text-foreground">
                    Bank transfer & card: you receive the full amount
                  </span>
                </label>
                {pmAxisPaymentsEnabled ? (
                  <p className="pl-7 text-xs leading-relaxed text-muted">
                    Residents pay through Stripe Checkout with bank (ACH), card, or Link and are charged exactly the
                    charge amount. PropLane covers payment processing, so the full charge amount transfers to your
                    connected payout account after checkout.
                    {pmConnectReady === false ? (
                      <>
                        {" "}
                        <button
                          type="button"
                          className="font-medium text-primary underline disabled:opacity-60"
                          onClick={goToPayoutSetup}
                          disabled={pmPayoutSetupBusy}
                          data-attr="resident-payment-payout-setup"
                        >
                          {pmPayoutSetupBusy ? "Opening Stripe…" : "Complete payout setup"}
                        </button>{" "}
                        before residents can pay by bank.
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2 rounded-xl border border-border bg-card p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
                    checked={pmCardEnabled}
                    onChange={(e) => setPmCardEnabled(e.target.checked)}
                    data-attr="resident-payment-card-toggle"
                  />
                  <span className="text-sm font-medium text-foreground">Credit card with Stripe</span>
                </label>
                {pmCardEnabled ? (
                  <p className="pl-7 text-xs leading-relaxed text-muted">
                    Residents can pay by card through Stripe Checkout at no added cost to them, and you receive the full
                    charge amount. PropLane covers card processing.
                    {pmConnectReady === false ? (
                      <>
                        {" "}
                        <button
                          type="button"
                          className="font-medium text-primary underline disabled:opacity-60"
                          onClick={goToPayoutSetup}
                          disabled={pmPayoutSetupBusy}
                          data-attr="resident-payment-payout-setup-card"
                        >
                          {pmPayoutSetupBusy ? "Opening Stripe…" : "Complete payout setup"}
                        </button>{" "}
                        first.
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </div>
          )}
          <PortalSectionActionRow className="pt-1">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setAddPaymentMethodOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              className="rounded-full"
              onClick={savePaymentMethodSettings}
              disabled={pmSaving || !pmPropertyId}
              data-attr="resident-payment-method-save"
            >
              {pmSaving ? "Saving…" : "Save"}
            </Button>
          </PortalSectionActionRow>
        </div>
      </Modal>

      <Modal
        open={addResidentOpen}
        title="Add resident"
        onClose={() => setAddResidentOpen(false)}
        footer={
          <ModalFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setAddResidentOpen(false)} disabled={arSaving}>
              Cancel
            </Button>
            <Button type="button" variant="primary" className="rounded-full" onClick={saveManualResident} disabled={arSaving}>
              {arSaving ? "Adding…" : "Add resident"}
            </Button>
          </ModalFooter>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Onboard an existing tenant: creates an active resident record, sets up payments, and can email portal instructions (no application or screening). Generate or upload a lease in Manager Review unless you attach an already-signed PDF below.
          </p>
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
              <Select
                value={arPropertyId}
                onChange={(e) => { setArPropertyId(e.target.value); setArRoomId(""); }}
               
              >
                <option value="">Select property…</option>
                {propertyOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Lease term</span>
              <Select
                value={arLeaseTermSelectValue}
                onChange={(e) => {
                  const selected = e.target.value;
                  if (selected === RESIDENT_LEASE_TERM_CUSTOM) {
                    setArLeaseTermCustomMode(true);
                    if (arLeaseTermPresetValues.includes(arLeaseTerm)) {
                      setArLeaseTerm("");
                    }
                    return;
                  }
                  setArLeaseTermCustomMode(false);
                  setArLeaseTerm(selected);
                }}
              >
                <option value="">Select…</option>
                {arLeaseTermOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
                <option value={RESIDENT_LEASE_TERM_CUSTOM}>Custom…</option>
              </Select>
              {arLeaseTermSelectValue === RESIDENT_LEASE_TERM_CUSTOM ? (
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
                <Select
                  value={arRoomId}
                  onChange={(e) => {
                    const roomId = e.target.value;
                    setArRoomId(roomId);
                  }}
                 
                >
                  <option value="">Select room…</option>
                  {arRoomOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}{r.monthlyRent ? ` · $${r.monthlyRent}/mo` : ""}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="rounded-xl border border-dashed border-border bg-accent/30 px-3 py-2 text-xs text-muted">
                  Add rooms to this property in listing setup to assign a resident room here.
                </p>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">{arIsShortTermStay ? "Daily rate ($)" : "Monthly rent ($)"}</span>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={arRent}
                onChange={(e) => setArRent(e.target.value)}
                placeholder={arIsShortTermStay ? "225.00" : "875.00"}
              />
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
              <span className="font-medium text-muted">Signed lease (PDF, optional)</span>
              <input
                type="file"
                accept="application/pdf"
                className="text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.type !== "application/pdf") {
                    showToast("Please choose a PDF file.");
                    e.target.value = "";
                    return;
                  }
                  if (file.size > 3.5 * 1024 * 1024) {
                    showToast("PDF too large (max 3.5 MB).");
                    e.target.value = "";
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    setArSignedLeaseDataUrl(reader.result as string);
                    setArSignedLeaseFileName(file.name);
                  };
                  reader.readAsDataURL(file);
                }}
              />
              {arSignedLeaseFileName ? (
                <span className="text-xs text-muted">Attached: {arSignedLeaseFileName}</span>
              ) : null}
            </label>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={arSendWelcome}
                onChange={(e) => setArSendWelcome(e.target.checked)}
                className="size-4 rounded border-border"
              />
              <span>Email portal setup instructions to the resident</span>
            </label>
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
        </div>
      </Modal>

      <Modal
        open={editResidentOpen}
        title="Edit resident"
        onClose={() => setEditResidentOpen(false)}
        footer={
          <ModalFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setEditResidentOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" className="rounded-full" onClick={saveEditedResident}>
              Save resident
            </Button>
          </ModalFooter>
        }
      >
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
              <Select
                value={erPropertyId}
                onChange={(e) => {
                  setErPropertyId(e.target.value);
                  setErRoomId("");
                }}
               
              >
                <option value="">Select property…</option>
                {propertyOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Lease term</span>
              <Select
                value={erLeaseTermSelectValue}
                onChange={(e) => {
                  const selected = e.target.value;
                  if (selected === RESIDENT_LEASE_TERM_CUSTOM) {
                    setErLeaseTermCustomMode(true);
                    if (erLeaseTermPresetValues.includes(erLeaseTerm)) {
                      setErLeaseTerm("");
                    }
                    return;
                  }
                  setErLeaseTermCustomMode(false);
                  setErLeaseTerm(selected);
                }}
               
              >
                <option value="">Select…</option>
                {erLeaseTermOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
                <option value={RESIDENT_LEASE_TERM_CUSTOM}>Custom…</option>
              </Select>
              {erLeaseTermSelectValue === RESIDENT_LEASE_TERM_CUSTOM ? (
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
                <Select
                  value={erRoomId}
                  onChange={(e) => {
                    const roomId = e.target.value;
                    setErRoomId(roomId);
                  }}
                 
                >
                  <option value="">Select room…</option>
                  {erRoomOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.monthlyRent ? ` · $${r.monthlyRent}/mo` : ""}
                    </option>
                  ))}
                </Select>
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
        </div>
      </Modal>

      <Modal
        open={applicationEditOpen && Boolean(selectedApplicationRow?.application)}
        title={
          selectedApplicationRow
            ? `Edit application · ${selectedApplicationRow.name || selected?.name || "Resident"}`
            : "Edit application"
        }
        onClose={() => setApplicationEditOpen(false)}
        panelClassName="max-w-4xl w-full"
      >
        {selectedApplicationRow?.application ? (
          <ResidentApplicationEditor
            row={selectedApplicationRow}
            residentEmail={(selectedApplicationRow.email ?? selected?.email ?? "").trim().toLowerCase()}
            preserveReviewStatus
            onCancel={() => setApplicationEditOpen(false)}
            onSaved={() => {
              setApplicationEditOpen(false);
              setHcTick((n) => n + 1);
            }}
          />
        ) : null}
      </Modal>

      <CheckrScreeningModal
        key={checkrScreeningRowId ?? "none"}
        row={
          checkrScreeningRowId
            ? readManagerApplicationRows().find((r) => r.id === checkrScreeningRowId) ?? null
            : null
        }
        open={checkrScreeningRowId !== null}
        onClose={() => setCheckrScreeningRowId(null)}
        onUpdated={handleScreeningUpdated}
      />

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
          void setApplicationBucket(row.id, "approved", { skipWelcomeEmail: skipMessage }).finally(() =>
            setApproveBusyId(null),
          );
        }}
      />

      <PortalNotificationPreviewModal
        open={welcomePreviewFor !== null}
        title="Email account setup · preview"
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
        title="Send lease to resident · preview"
        onClose={() => setLeaseSentPreview(null)}
        recipient={leaseSentPreview?.recipient ?? ""}
        subject={leaseSentPreview?.subject ?? ""}
        body={leaseSentPreview?.body ?? ""}
        footerNote="The lease will be released to the resident portal after you confirm. This message is delivered to PropLane inbox and email."
        confirmLabel="Send lease & notification"
        confirmLabelWithoutMessage="Send lease only"
        confirmBusy={leaseSendBusy}
        confirmBusyLabel="Sending…"
        onConfirm={(skipMessage) => void confirmSendLeaseToResident(skipMessage)}
      />

      <PortalNotificationPreviewModal
        open={leaseReminderPreview !== null}
        title="Lease signing reminder · preview"
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

      <Modal
        open={messageOpen}
        title="Message resident"
        onClose={() => {
          if (messageBusy) return;
          setMessageOpen(false);
        }}
        footer={
          <ModalFooter>
            <Button type="button" variant="outline" className="rounded-full" disabled={messageBusy} onClick={() => setMessageOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" className="rounded-full" disabled={messageBusy} onClick={() => void sendResidentMessage()}>
              {messageBusy ? "Saving…" : messageScheduleLater ? "Schedule message" : "Send"}
            </Button>
          </ModalFooter>
        }
      >
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
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary"
              checked={messageScheduleLater}
              onChange={(e) => setMessageScheduleLater(e.target.checked)}
            />
            <span className="font-medium text-foreground">Schedule for later</span>
          </label>
          {messageScheduleLater ? (
            <label className="block text-sm">
              <span className="font-medium text-muted">Send date & time</span>
              <Input
                type="datetime-local"
                className="mt-1.5"
                value={messageSendAt}
                onChange={(e) => setMessageSendAt(e.target.value)}
              />
            </label>
          ) : null}
        </div>
      </Modal>
      </ManagerPortalPageShell>
    </>
  );
}
