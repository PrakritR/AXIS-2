"use client";

import { useEffect, useRef } from "react";
import {
  approveDemoApplication,
  demoLeaseRowIdForApplication,
  runDemoGenerateLease,
  runDemoManagerSignLease,
  runDemoResidentSignLease,
  runDemoScreeningForApplication,
  runDemoSendLeaseToResident,
} from "@/lib/demo/demo-guided-actions";
import { finishGuidedDemoTour, getDemoSegment, isGuidedDemoActive, setGuidedDemoStep } from "@/lib/demo/demo-guided";
import { CANONICAL_DEMO_GUIDED_NAME } from "@/lib/demo/demo-canonical-accounts";
import { buildDemoPropertyCreationSubmission } from "@/lib/demo/demo-listing-autofill";
import {
  clickIfPresent,
  confirmNotificationModal,
  demoNavClick,
  expandCollapsible,
  expandPortalRow,
  prepareAndConfirmLeaseSign,
  sleep,
  waitForEvent,
  waitForSelector,
} from "@/lib/demo/demo-playback-utils";
import {
  DEMO_APPLICATION_SUBMITTED_EVENT,
  DEMO_INBOX_COMPOSE_PREFILL_EVENT,
  DEMO_INBOX_REPLY_PREFILL_EVENT,
  DEMO_LISTING_AUTOFILL_EVENT,
  DEMO_LISTING_SUBMITTED_EVENT,
  DEMO_MANAGER_INBOX_THREAD_ID,
  DEMO_OPEN_CREATE_LISTING_EVENT,
  DEMO_PROMOTION_AUTOFILL_EVENT,
  DEMO_PROMOTION_GENERATED_EVENT,
  DEMO_RENTAL_AUTOFILL_EVENT,
  DEMO_RESIDENT_INBOX_THREAD_ID,
  dispatchDemoPropertiesStage,
  getDemoPlaybackApplicationAxisId,
  getDemoPlaybackPendingId,
  setDemoPlaybackApplicationAxisId,
  setDemoPlaybackListedPropertyId,
  setDemoPlaybackPendingId,
} from "@/lib/demo/demo-playback";
import type { DemoSegment } from "@/lib/demo/demo-segments";
import { prepareDemoListedProperty, prepareDemoSegment } from "@/lib/demo/demo-segment-prep";
import {
  acceptDemoWorkOrderBid,
  approveDemoWorkOrderPay,
  createDemoResidentServiceRequest,
  DEMO_GUIDED_WORK_ORDER_ID,
  markDemoWorkOrderVendorDone,
  scheduleDemoWorkOrder,
  submitDemoVendorBid,
} from "@/lib/demo/demo-work-order-actions";
import { approvePendingManagerProperty, PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";
import { DEMO_RESIDENT_EMAIL } from "@/lib/demo/demo-session";
import type { DemoPortalRole } from "@/lib/demo/demo-session";

const CREATE_BTN = '[data-attr="manager-properties-create"]';
const NEW_APPLICATION = '[data-attr="resident-applications-new"]';
const SCREENING_TOGGLE = '[data-attr="application-screening-toggle"]';
const RUN_SCREENING = '[data-attr="run-background-check"]';
const RUN_SCREENING_CONFIRM = '[data-attr="run-screening-checkr"]';
const APPLICATION_APPROVE = '[data-attr="application-approve"]';
const LEASES_TAB_MANAGER = '[data-attr="leases-tab-manager"]';
const LEASES_TAB_RESIDENT = '[data-attr="leases-tab-resident"]';
const LEASES_TAB_SIGNED = '[data-attr="leases-tab-signed"]';
const LEASES_TAB_COMPLETED = '[data-attr="leases-tab-completed"]';
const LEASE_GENERATE = '[data-attr="lease-generate"]';
const LEASE_SEND = '[data-attr="lease-send-resident"]';
const LEASE_MANAGER_SIGN = '[data-attr="lease-manager-sign"]';
const RESIDENT_SIGN_LEASE = '[data-attr="resident-sign-lease"]';
const PAYMENTS_SEND_REMINDER = '[data-attr="payments-send-reminder"]';
const PAYMENTS_MARK_PAID = '[data-attr="payments-mark-selected-paid"]';
const RESIDENT_PAY_ALL = '[data-attr="resident-payments-pay-all"]';
const SERVICES_TAB_WO = '[data-attr="manager-services-tab-work-orders"]';
const RESIDENT_MAINTENANCE_SUBMIT = '[data-attr="resident-maintenance-submit"]';
const WORK_ORDER_ACCEPT_BID = '[data-attr="work-order-accept-bid"]';
const WORK_ORDER_AUTO_SCHEDULE = '[data-attr="work-order-auto-schedule"]';
const WORK_ORDER_APPROVE_PAY = '[data-attr="work-order-approve-pay"]';
const WORK_ORDER_APPROVE_CONFIRM = '[data-attr="work-order-approve-pay-confirm"]';
const VENDOR_SUBMIT_BID = '[data-attr="vendor-submit-bid"]';
const VENDOR_MARK_DONE = '[data-attr="vendor-mark-done"]';
const INBOX_NEW_MESSAGE = '[data-attr="inbox-new-message"]';
const INBOX_COMPOSE_SEND = '[data-attr="inbox-compose-send"]';
const INBOX_MARK_READ = '[data-attr="inbox-mark-read"]';
const INBOX_REPLY_SEND = '[data-attr="inbox-reply-send"]';
const PROMOTION_NEW = '[data-attr="promotion-new"]';
const PROMOTION_GENERATE = '[data-attr="promotion-generate"]';
const PROMOTION_FLYER_DOWNLOAD = '[data-attr="promotion-flyer-download"]';
const PROMOTION_ROW = '[data-attr="promotion-row"]';

function inboxThreadSelector(threadId: string): string {
  return `#portal-inbox-thread-${threadId}`;
}

function applicationRowSelector(axisId: string): string {
  return `#portal-application-${axisId}`;
}

function leaseRowSelector(axisId: string): string {
  return `#portal-lease-${demoLeaseRowIdForApplication(axisId)}`;
}

function workOrderRowSelector(id: string): string {
  return `#portal-work-order-${id}`;
}

export type DemoPlaybackNav = {
  setDemoRole: (role: DemoPortalRole) => void;
  onNavigateProperties: () => void;
  onNavigateResidentDashboard: () => void;
  onNavigateResidentApplications: () => void;
  onNavigateManagerApplications: () => void;
  onNavigateManagerLeases: (tab?: string | null) => void;
  onNavigateResidentLease: () => void;
  onNavigateManagerPayments: () => void;
  onNavigateResidentPayments: () => void;
  onNavigateManagerServices: (tab?: string | null) => void;
  onNavigateResidentServices: (tab?: string | null) => void;
  onNavigateVendorWorkOrders: () => void;
  onNavigateManagerInbox: (tab?: string | null) => void;
  onNavigateResidentInbox: (tab?: string | null) => void;
  onNavigateManagerPromotion: () => void;
};

async function runResidentApplicationFlow(
  frame: HTMLElement,
  nav: DemoPlaybackNav,
  listedPropertyId: string | null,
): Promise<string | null> {
  if (!isGuidedDemoActive()) return null;
  nav.setDemoRole("resident");
  nav.onNavigateResidentDashboard();
  await sleep(700);
  await demoNavClick(frame, "dashboard");
  await demoNavClick(frame, "applications");
  await clickIfPresent(frame, NEW_APPLICATION);
  await waitForSelector(frame, ".rental-wizard", 10000);
  const submitPromise = waitForEvent(DEMO_APPLICATION_SUBMITTED_EVENT, 20000);
  if (listedPropertyId) {
    window.dispatchEvent(
      new CustomEvent(DEMO_RENTAL_AUTOFILL_EVENT, {
        detail: { propertyId: listedPropertyId, submitAfter: true },
      }),
    );
  }
  await submitPromise;
  await sleep(600);
  if (!isGuidedDemoActive()) return null;
  return getDemoPlaybackApplicationAxisId();
}

async function runScreeningAndApprove(
  frame: HTMLElement,
  nav: DemoPlaybackNav,
  applicationAxisId: string,
  screeningStep: number,
  approveStep: number,
): Promise<void> {
  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(screeningStep);
  nav.setDemoRole("manager");
  nav.onNavigateManagerApplications();
  await sleep(800);
  await demoNavClick(frame, "applications");
  await expandPortalRow(frame, applicationRowSelector(applicationAxisId));
  await expandCollapsible(frame, SCREENING_TOGGLE);
  if (await waitForSelector(frame, RUN_SCREENING, 5000)) {
    await clickIfPresent(frame, RUN_SCREENING);
    await clickIfPresent(frame, RUN_SCREENING_CONFIRM, { align: "end", timeoutMs: 8000 });
    await sleep(2000);
  } else if (isGuidedDemoActive()) {
    runDemoScreeningForApplication(applicationAxisId);
    await sleep(400);
  }

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(approveStep);
  await sleep(400);
  await expandPortalRow(frame, applicationRowSelector(applicationAxisId));
  let approved = false;
  if (await waitForSelector(frame, APPLICATION_APPROVE, 5000)) {
    await clickIfPresent(frame, APPLICATION_APPROVE, { align: "end" });
    if (await waitForSelector(frame, '[data-attr="portal-notification-confirm"]', 6000)) {
      await confirmNotificationModal(frame);
      approved = true;
    }
  }
  if (!approved && isGuidedDemoActive()) await approveDemoApplication(applicationAxisId);
  await sleep(700);
}

async function runLeaseFlow(
  frame: HTMLElement,
  nav: DemoPlaybackNav,
  applicationAxisId: string,
  generateStep: number,
  sendStep: number,
  residentSignStep: number,
  managerSignStep: number,
): Promise<void> {
  const signerName = CANONICAL_DEMO_GUIDED_NAME;

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(generateStep);
  nav.setDemoRole("manager");
  nav.onNavigateManagerLeases("manager");
  await sleep(800);
  await demoNavClick(frame, "leases");
  await clickIfPresent(frame, LEASES_TAB_MANAGER);
  await expandPortalRow(frame, leaseRowSelector(applicationAxisId));
  if (await waitForSelector(frame, LEASE_GENERATE, 6000)) {
    await clickIfPresent(frame, LEASE_GENERATE, { align: "end" });
    await sleep(1400);
  } else if (isGuidedDemoActive()) {
    runDemoGenerateLease(applicationAxisId);
  }

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(sendStep);
  await clickIfPresent(frame, LEASES_TAB_RESIDENT);
  await expandPortalRow(frame, leaseRowSelector(applicationAxisId));
  if (await waitForSelector(frame, LEASE_SEND, 6000)) {
    await clickIfPresent(frame, LEASE_SEND, { align: "end" });
    await confirmNotificationModal(frame);
  } else if (isGuidedDemoActive()) {
    await runDemoSendLeaseToResident(applicationAxisId);
  }
  await sleep(700);

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(residentSignStep);
  nav.setDemoRole("resident");
  nav.onNavigateResidentLease();
  await sleep(800);
  await demoNavClick(frame, "lease");
  if (await waitForSelector(frame, RESIDENT_SIGN_LEASE, 8000)) {
    await clickIfPresent(frame, RESIDENT_SIGN_LEASE, { align: "end" });
    await prepareAndConfirmLeaseSign(frame, signerName);
  } else if (isGuidedDemoActive()) {
    await runDemoResidentSignLease();
  }
  await sleep(700);

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(managerSignStep);
  nav.setDemoRole("manager");
  nav.onNavigateManagerLeases("signed");
  await sleep(800);
  await demoNavClick(frame, "leases");
  await clickIfPresent(frame, LEASES_TAB_SIGNED);
  await expandPortalRow(frame, leaseRowSelector(applicationAxisId));
  if (await waitForSelector(frame, LEASE_MANAGER_SIGN, 6000)) {
    await clickIfPresent(frame, LEASE_MANAGER_SIGN, { align: "end" });
    await prepareAndConfirmLeaseSign(frame, signerName);
  } else if (isGuidedDemoActive()) {
    await runDemoManagerSignLease(applicationAxisId, signerName);
  }
  await clickIfPresent(frame, LEASES_TAB_COMPLETED);
  await sleep(500);
}

async function runOverallSegment(frame: HTMLElement, nav: DemoPlaybackNav): Promise<void> {
  setDemoPlaybackPendingId(null);
  setDemoPlaybackListedPropertyId(null);
  setDemoPlaybackApplicationAxisId(null);

  nav.onNavigateProperties();
  dispatchDemoPropertiesStage("listed");
  await sleep(800);

  window.dispatchEvent(new Event(DEMO_OPEN_CREATE_LISTING_EVENT));
  await sleep(450);
  await clickIfPresent(frame, CREATE_BTN);
  await waitForSelector(frame, "#manager-add-listing-form", 10000);
  const listingSubmitPromise = waitForEvent(DEMO_LISTING_SUBMITTED_EVENT, 20000);
  window.dispatchEvent(
    new CustomEvent(DEMO_LISTING_AUTOFILL_EVENT, {
      detail: { submission: buildDemoPropertyCreationSubmission(), submitAfter: true },
    }),
  );
  await listingSubmitPromise;
  await sleep(600);

  let pendingId = getDemoPlaybackPendingId();
  if (!pendingId) {
    await sleep(1200);
    pendingId = getDemoPlaybackPendingId();
  }
  dispatchDemoPropertiesStage("listed");
  await sleep(2800);

  let listedPropertyId: string | null = null;
  if (pendingId) {
    const listed = approvePendingManagerProperty(pendingId);
    listedPropertyId = listed?.id ?? null;
    window.dispatchEvent(new Event(PROPERTY_PIPELINE_EVENT));
  }
  if (!listedPropertyId && isGuidedDemoActive()) {
    // Wizard id capture failed (slow submit / missed event) — list a property
    // programmatically so the tour continues instead of dying after step 1.
    listedPropertyId = await prepareDemoListedProperty();
  }
  if (listedPropertyId) setDemoPlaybackListedPropertyId(listedPropertyId);
  dispatchDemoPropertiesStage("listed");
  await sleep(700);

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(2);
  const applicationAxisId = await runResidentApplicationFlow(frame, nav, listedPropertyId);
  if (!applicationAxisId) return;

  await runScreeningAndApprove(frame, nav, applicationAxisId, 3, 4);
  await runLeaseFlow(frame, nav, applicationAxisId, 5, 6, 7, 8);
}

async function runLeasingSegment(
  frame: HTMLElement,
  nav: DemoPlaybackNav,
  propertyId: string | null,
): Promise<void> {
  setGuidedDemoStep(1);
  const applicationAxisId = await runResidentApplicationFlow(frame, nav, propertyId);
  if (!applicationAxisId) return;
  await runScreeningAndApprove(frame, nav, applicationAxisId, 2, 3);
  await runLeaseFlow(frame, nav, applicationAxisId, 4, 5, 6, 7);
}

async function runPaymentsSegment(frame: HTMLElement, nav: DemoPlaybackNav): Promise<void> {
  setGuidedDemoStep(1);
  nav.setDemoRole("manager");
  nav.onNavigateManagerPayments();
  await sleep(800);
  await demoNavClick(frame, "payments");
  await sleep(600);

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(2);
  await clickIfPresent(frame, PAYMENTS_SEND_REMINDER, { align: "end" });
  await sleep(800);

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(3);
  nav.setDemoRole("resident");
  nav.onNavigateResidentPayments();
  await sleep(800);
  await demoNavClick(frame, "payments");
  await clickIfPresent(frame, '[data-attr="resident-payments-tab-overdue"]');
  if (!(await clickIfPresent(frame, RESIDENT_PAY_ALL, { align: "end" }))) {
    await clickIfPresent(frame, '[data-attr="resident-payments-pay-selected"]', { align: "end" });
  }
  await sleep(1200);

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(4);
  nav.setDemoRole("manager");
  nav.onNavigateManagerPayments();
  await sleep(800);
  await demoNavClick(frame, "payments");
  await clickIfPresent(frame, PAYMENTS_MARK_PAID, { align: "end" });
  await sleep(600);
}

async function runApplicationsSegment(
  frame: HTMLElement,
  nav: DemoPlaybackNav,
  propertyId: string | null,
): Promise<void> {
  setGuidedDemoStep(1);
  const applicationAxisId = await runResidentApplicationFlow(frame, nav, propertyId);
  if (!applicationAxisId) return;
  await runScreeningAndApprove(frame, nav, applicationAxisId, 2, 3);
}

async function runInboxSegment(frame: HTMLElement, nav: DemoPlaybackNav): Promise<void> {
  setGuidedDemoStep(1);
  nav.setDemoRole("manager");
  nav.onNavigateManagerInbox("unopened");
  await sleep(800);
  await demoNavClick(frame, "communication");
  await expandPortalRow(frame, inboxThreadSelector(DEMO_MANAGER_INBOX_THREAD_ID));
  await clickIfPresent(frame, INBOX_MARK_READ);

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(2);
  await clickIfPresent(frame, INBOX_NEW_MESSAGE);
  await sleep(400);
  window.dispatchEvent(
    new CustomEvent(DEMO_INBOX_COMPOSE_PREFILL_EVENT, {
      detail: { residentEmail: DEMO_RESIDENT_EMAIL },
    }),
  );
  await sleep(300);
  await clickIfPresent(frame, INBOX_COMPOSE_SEND, { align: "end" });
  await sleep(700);

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(3);
  nav.setDemoRole("resident");
  nav.onNavigateResidentInbox("unopened");
  await sleep(800);
  await demoNavClick(frame, "communication");
  await expandPortalRow(frame, inboxThreadSelector(DEMO_RESIDENT_INBOX_THREAD_ID));
  window.dispatchEvent(
    new CustomEvent(DEMO_INBOX_REPLY_PREFILL_EVENT, {
      detail: {
        rowId: DEMO_RESIDENT_INBOX_THREAD_ID,
        text: "Thanks — I'll review the renewal paperwork tonight.",
      },
    }),
  );
  await sleep(300);
  await clickIfPresent(frame, INBOX_REPLY_SEND, { align: "end" });
  await sleep(500);
}

async function runPromotionSegment(frame: HTMLElement, nav: DemoPlaybackNav, propertyId: string | null): Promise<void> {
  setGuidedDemoStep(1);
  nav.setDemoRole("manager");
  nav.onNavigateManagerPromotion();
  await sleep(800);
  await demoNavClick(frame, "promotion");

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(2);
  await clickIfPresent(frame, PROMOTION_NEW);

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(3);
  const generatedPromise = waitForEvent(DEMO_PROMOTION_GENERATED_EVENT, 20000);
  window.dispatchEvent(
    new CustomEvent(DEMO_PROMOTION_AUTOFILL_EVENT, {
      detail: { propertyId: propertyId ?? undefined, generateAfter: true },
    }),
  );
  if (!(await generatedPromise)) {
    await clickIfPresent(frame, PROMOTION_GENERATE, { align: "end" });
  }
  await sleep(800);

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(4);
  await clickIfPresent(frame, PROMOTION_ROW);
  await clickIfPresent(frame, PROMOTION_FLYER_DOWNLOAD, { align: "end" });
  await sleep(500);
}

async function runWorkOrdersSegment(frame: HTMLElement, nav: DemoPlaybackNav, propertyId: string | null): Promise<void> {
  setGuidedDemoStep(1);
  nav.setDemoRole("resident");
  nav.onNavigateResidentServices("work-orders");
  await sleep(800);
  await demoNavClick(frame, "services");
  await clickIfPresent(frame, '[data-attr="resident-report-maintenance"]');
  createDemoResidentServiceRequest(propertyId ?? "");
  await clickIfPresent(frame, RESIDENT_MAINTENANCE_SUBMIT, { align: "end" });
  await sleep(600);

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(2);
  nav.setDemoRole("manager");
  nav.onNavigateManagerServices("work-orders");
  await sleep(800);
  await demoNavClick(frame, "services");
  await clickIfPresent(frame, SERVICES_TAB_WO);
  await expandPortalRow(frame, workOrderRowSelector(DEMO_GUIDED_WORK_ORDER_ID));

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(3);
  nav.setDemoRole("vendor");
  nav.onNavigateVendorWorkOrders();
  await sleep(800);
  await demoNavClick(frame, "work-orders");
  submitDemoVendorBid();
  await sleep(400);
  if (!(await clickIfPresent(frame, VENDOR_SUBMIT_BID, { align: "end" })) && isGuidedDemoActive()) {
    submitDemoVendorBid();
  }

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(4);
  nav.setDemoRole("manager");
  nav.onNavigateManagerServices("work-orders");
  await sleep(800);
  await demoNavClick(frame, "services");
  await clickIfPresent(frame, SERVICES_TAB_WO);
  await expandPortalRow(frame, workOrderRowSelector(DEMO_GUIDED_WORK_ORDER_ID));
  if (!(await clickIfPresent(frame, WORK_ORDER_ACCEPT_BID, { align: "end" })) && isGuidedDemoActive()) {
    acceptDemoWorkOrderBid();
  }

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(5);
  if (!(await clickIfPresent(frame, WORK_ORDER_AUTO_SCHEDULE, { align: "end" })) && isGuidedDemoActive()) {
    scheduleDemoWorkOrder();
  }

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(6);
  nav.setDemoRole("vendor");
  nav.onNavigateVendorWorkOrders();
  await sleep(800);
  await demoNavClick(frame, "work-orders");
  await expandPortalRow(frame, workOrderRowSelector(DEMO_GUIDED_WORK_ORDER_ID));
  if (!(await clickIfPresent(frame, VENDOR_MARK_DONE, { align: "end" })) && isGuidedDemoActive()) {
    markDemoWorkOrderVendorDone();
  }

  if (!isGuidedDemoActive()) return;
  setGuidedDemoStep(7);
  nav.setDemoRole("manager");
  nav.onNavigateManagerServices("work-orders");
  await sleep(800);
  await demoNavClick(frame, "services");
  await clickIfPresent(frame, SERVICES_TAB_WO);
  await expandPortalRow(frame, workOrderRowSelector(DEMO_GUIDED_WORK_ORDER_ID));
  if (await clickIfPresent(frame, WORK_ORDER_APPROVE_PAY, { align: "end" })) {
    await clickIfPresent(frame, WORK_ORDER_APPROVE_CONFIRM, { align: "end" });
  } else if (isGuidedDemoActive()) {
    approveDemoWorkOrderPay();
  }
  await sleep(500);
}

async function runSegmentPlayback(
  segment: DemoSegment,
  frame: HTMLElement,
  nav: DemoPlaybackNav,
): Promise<void> {
  const { propertyId } = await prepareDemoSegment(segment);
  if (segment === "overall") {
    await runOverallSegment(frame, nav);
    return;
  }
  if (segment === "leasing") {
    await runLeasingSegment(frame, nav, propertyId);
    return;
  }
  if (segment === "applications") {
    await runApplicationsSegment(frame, nav, propertyId);
    return;
  }
  if (segment === "communication") {
    await runInboxSegment(frame, nav);
    return;
  }
  if (segment === "promotion") {
    await runPromotionSegment(frame, nav, propertyId);
    return;
  }
  if (segment === "payments") {
    await runPaymentsSegment(frame, nav);
    return;
  }
  if (segment === "work_orders") {
    await runWorkOrdersSegment(frame, nav, propertyId);
  }
}

export function DemoSegmentPlayback({
  frameEl,
  active,
  onTourFinished,
  setDemoRole,
  onNavigateProperties,
  onNavigateResidentDashboard,
  onNavigateResidentApplications,
  onNavigateManagerApplications,
  onNavigateManagerLeases,
  onNavigateResidentLease,
  onNavigateManagerPayments,
  onNavigateResidentPayments,
  onNavigateManagerServices,
  onNavigateResidentServices,
  onNavigateVendorWorkOrders,
  onNavigateManagerInbox,
  onNavigateResidentInbox,
  onNavigateManagerPromotion,
}: {
  frameEl: HTMLElement | null;
  active: boolean;
  /** Runs after autoplay completes on its own (NOT on Exit-tour or unmount). */
  onTourFinished?: () => void;
} & DemoPlaybackNav) {
  const ranRef = useRef(false);
  const segmentRef = useRef<DemoSegment>("overall");

  useEffect(() => {
    if (!active) {
      ranRef.current = false;
      return;
    }
    if (!frameEl || ranRef.current) return;
    ranRef.current = true;
    let cancelled = false;
    segmentRef.current = getDemoSegment();

    const nav: DemoPlaybackNav = {
      setDemoRole,
      onNavigateProperties,
      onNavigateResidentDashboard,
      onNavigateResidentApplications,
      onNavigateManagerApplications,
      onNavigateManagerLeases,
      onNavigateResidentLease,
      onNavigateManagerPayments,
      onNavigateResidentPayments,
      onNavigateManagerServices,
      onNavigateResidentServices,
      onNavigateVendorWorkOrders,
      onNavigateManagerInbox,
      onNavigateResidentInbox,
      onNavigateManagerPromotion,
    };

    const onListingSubmitted = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id) setDemoPlaybackPendingId(id);
    };
    const onAppSubmitted = (e: Event) => {
      const axisId = (e as CustomEvent<{ axisId?: string }>).detail?.axisId?.trim();
      if (axisId) setDemoPlaybackApplicationAxisId(axisId);
    };
    window.addEventListener(DEMO_LISTING_SUBMITTED_EVENT, onListingSubmitted as EventListener);
    window.addEventListener(DEMO_APPLICATION_SUBMITTED_EVENT, onAppSubmitted as EventListener);

    void runSegmentPlayback(segmentRef.current, frameEl, nav)
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        // Natural finish must land on the same state as the Exit button: the
        // guided scope flips back to the idle demo scope here, so without the
        // idle re-seed (onTourFinished) every panel would read stale/partial
        // rows written under the guided scope — the post-tour "glitch".
        finishGuidedDemoTour();
        onTourFinished?.();
      });

    return () => {
      cancelled = true;
      window.removeEventListener(DEMO_LISTING_SUBMITTED_EVENT, onListingSubmitted as EventListener);
      window.removeEventListener(DEMO_APPLICATION_SUBMITTED_EVENT, onAppSubmitted as EventListener);
    };
  }, [
    active,
    frameEl,
    onTourFinished,
    setDemoRole,
    onNavigateProperties,
    onNavigateResidentDashboard,
    onNavigateResidentApplications,
    onNavigateManagerApplications,
    onNavigateManagerLeases,
    onNavigateResidentLease,
    onNavigateManagerPayments,
    onNavigateResidentPayments,
    onNavigateManagerServices,
    onNavigateResidentServices,
    onNavigateVendorWorkOrders,
    onNavigateManagerInbox,
    onNavigateResidentInbox,
    onNavigateManagerPromotion,
  ]);

  return null;
}

/** @deprecated Use DemoSegmentPlayback */
export const DemoPropertyPlayback = DemoSegmentPlayback;
