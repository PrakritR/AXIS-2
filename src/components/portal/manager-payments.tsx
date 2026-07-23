"use client";

import { isDemoModeActive } from "@/lib/demo/demo-session";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
  ManagerPortalFilterRow,
  PORTAL_HEADER_ACTION_BTN,
} from "@/components/portal/portal-metrics";
import { PillTabs } from "@/components/ui/tabs";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { ManagerPaymentsLedgerPanel } from "@/components/portal/manager-payments-ledger-panel";
import { ManagerOutgoingPaymentsPanel } from "@/components/portal/manager-outgoing-payments-panel";
import { ManagerAddOutgoingPaymentModal } from "@/components/portal/manager-add-outgoing-payment-modal";
import type { ManagerPaymentBucket, ManagerPaymentDirection } from "@/data/demo-portal";
import {
  compareDueDateMs,
  householdChargeToLedgerRow,
  HOUSEHOLD_CHARGES_EVENT,
  isManagerAddedOneOffCharge,
  readChargesForManager,
  reconcileApprovedResidentPaymentSchedules,
  removeResidentHouseholdPaymentData,
  syncHouseholdChargesFromServer,
} from "@/lib/household-charges";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { ManagerAddPaymentModal } from "@/components/portal/manager-add-payment-modal";
import { PortalStripeConnectPanel } from "@/components/portal/portal-stripe-connect-panel";
import { usePaidPortalBasePath } from "@/lib/portal-base-path-client";
import {
  MANAGER_APPLICATIONS_EVENT,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import { applicationVisibleToPortalUser, collectLinkedPropertyIdsForModule } from "@/lib/manager-portfolio-access";
import { getRoomChoiceLabel } from "@/lib/rental-application/data";
import { syncPropertyPipelineFromServer, readExtraListingsForUser } from "@/lib/demo-property-pipeline";
import { isCurrentResidentApplicationRow } from "@/lib/current-resident";
import {
  ReminderSettingsModal,
  useScheduledPaymentMessages,
} from "@/components/portal/payment-schedule-ui";
import { formatFriendlyReminderSchedule } from "@/lib/payment-reminder-presets";
import {
  buildManagerOutgoingPaymentRows,
  MANAGER_OUTGOING_PAYMENTS_EVENT,
  readManagerOutgoingExpenses,
  syncManagerOutgoingExpensesFromServer,
} from "@/lib/manager-outgoing-payments";
import {
  MANAGER_WORK_ORDERS_EVENT,
  readManagerWorkOrderRows,
  syncManagerWorkOrdersFromServer,
} from "@/lib/manager-work-orders-storage";
import {
  MANAGER_VENDORS_EVENT,
  readOwnActiveManagerVendorRows,
  syncManagerVendorsFromServer,
} from "@/lib/manager-vendors-storage";

const DIRECTION_LABELS: { id: ManagerPaymentDirection; label: string }[] = [
  { id: "incoming", label: "Incoming" },
  { id: "outgoing", label: "Outgoing" },
];

const PAY_LABELS: { id: ManagerPaymentBucket; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
];

const PAYMENT_ACCOUNT_EXCLUSIONS = ["sharad ramachandran", "sharad"] as const;

function shouldExcludePaymentAccount(residentName: string, residentEmail?: string): boolean {
  const name = (residentName ?? "").trim().toLowerCase();
  const email = (residentEmail ?? "").trim().toLowerCase();
  return PAYMENT_ACCOUNT_EXCLUSIONS.some((token) => name.includes(token) || email.includes(token));
}

function normalizePropertyLabel(label: string | undefined): string {
  const trimmed = (label ?? "").trim();
  if (!trimmed) return "";
  return trimmed
    .replace(/\s*·\s*[^·]*::[^·]*$/i, "")
    .replace(/\s+[.-]\s+[^\s]+::[^\s]+$/i, "")
    .trim();
}

export function ManagerPayments() {
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const portalBase = usePaidPortalBasePath();
  const [direction, setDirection] = useState<ManagerPaymentDirection>("incoming");
  const [bucket, setBucket] = useState<ManagerPaymentBucket>("pending");
  const [hcTick, setHcTick] = useState(0);
  const [outgoingTick, setOutgoingTick] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [addOutgoingOpen, setAddOutgoingOpen] = useState(false);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [residentFilter, setResidentFilter] = useState("");
  const [applicationTick, setApplicationTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const [reminderSettingsOpen, setReminderSettingsOpen] = useState(false);
  const [bankLinkBanner, setBankLinkBanner] = useState(false);
  // Per-payment reminder lists show the full saved default schedule, so bypass
  // the Inbox schedule-visibility window (which only gates Inbox → Schedule).
  const { messages: scheduledMessages, settings: reminderSettings, reload: reloadSchedule, setSettings: setReminderSettings } = useScheduledPaymentMessages({ includeHidden: true });
  const reminderScheduleSummary = useMemo(
    () => (reminderSettings ? formatFriendlyReminderSchedule(reminderSettings) : undefined),
    [reminderSettings],
  );
  const ledgerDataVersion = `${hcTick}:${applicationTick}:${propertyTick}:${outgoingTick}`;

  useEffect(() => {
    const onOutgoing = () => setOutgoingTick((n) => n + 1);
    void syncManagerOutgoingExpensesFromServer().then(onOutgoing);
    void syncManagerWorkOrdersFromServer().then(onOutgoing);
    void syncManagerVendorsFromServer();
    window.addEventListener(MANAGER_OUTGOING_PAYMENTS_EVENT, onOutgoing);
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, onOutgoing);
    window.addEventListener(MANAGER_VENDORS_EVENT, onOutgoing);
    return () => {
      window.removeEventListener(MANAGER_OUTGOING_PAYMENTS_EVENT, onOutgoing);
      window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, onOutgoing);
      window.removeEventListener(MANAGER_VENDORS_EVENT, onOutgoing);
    };
  }, []);

  useEffect(() => {
    const on = () => setHcTick((n) => n + 1);
    void syncHouseholdChargesFromServer(true).then(on);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    return () => window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
  }, []);

  useEffect(() => {
    const on = () => setApplicationTick((n) => n + 1);
    // Only sync once on mount, not on every event to avoid excessive syncs
    void syncManagerApplicationsFromServer({ managerUserId: userId }).then(on);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, on);
    return () => {
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, on);
    };
  }, [userId]);

  useEffect(() => {
    // Don't repeatedly sync applications on charge updates
    void syncPropertyPipelineFromServer().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!authReady || !userId) return;
    void syncPropertyPipelineFromServer().then(() => setPropertyTick((n) => n + 1));
  }, [authReady, userId]);

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
        // Clear local cache first so the re-sync doesn't push orphaned charges back to server
        for (const email of body.purgedEmails ?? []) {
          removeResidentHouseholdPaymentData(email);
        }
        void syncHouseholdChargesFromServer(true).then(() => {
          if (cancelled) return;
          setApplicationTick((n) => n + 1);
          setHcTick((n) => n + 1);
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authReady, userId]);

  useEffect(() => {
    if (!authReady || !userId) return;
    const visibleApprovedCount = readManagerApplicationRows().filter(
      (row) => row.bucket === "approved" && applicationVisibleToPortalUser(row, userId),
    ).length;
    if (visibleApprovedCount === 0) return;
    reconcileApprovedResidentPaymentSchedules(userId);
  }, [authReady, userId, applicationTick]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const payouts = params.get("payouts");
    const connect = params.get("connect");
    if (connect === "done" || connect === "refresh") {
      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage({ type: "axis-stripe-connect", connect }, window.location.origin);
        } catch {
          /* cross-origin or closed */
        }
        window.close();
        return;
      }
      if (connect === "done") {
        setBankLinkBanner(true);
      }
      // Same-tab return: PortalStripeConnectPanel clears ?connect= and refreshes status.
      return;
    }
    if (payouts === "1") {
      window.location.replace(`${portalBase}/payments`);
    }
  }, [portalBase]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== "axis-stripe-connect") return;
      if (e.data?.connect === "done") {
        showToast("Bank account linked. You're ready to receive resident payments.");
        setBankLinkBanner(true);
      } else if (e.data?.connect === "refresh") {
        showToast("Setup link expired. Click Finish setup to try again.");
      }
      window.dispatchEvent(new Event("axis-stripe-connect-refresh"));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [showToast]);

  const mergedRows = useMemo(() => {
    void ledgerDataVersion;
    const applications = readManagerApplicationRows();
    const previousResidentEmails = new Set(
      applications
        .filter((row) => !isCurrentResidentApplicationRow(row))
        .map((row) => row.email?.trim().toLowerCase())
        .filter((e): e is string => Boolean(e))
    );
    return readChargesForManager(userId, { linkedPropertyIds: collectLinkedPropertyIdsForModule(userId ?? "", "payments") })
      .filter((charge) => !shouldExcludePaymentAccount(charge.residentName, charge.residentEmail))
      .filter((charge) => {
        // Keep manager "Add payment" one-offs even if that email later moves to Previous.
        if (isManagerAddedOneOffCharge(charge)) return true;
        const email = charge.residentEmail?.trim().toLowerCase();
        return !email || !previousResidentEmails.has(email);
      })
      .map((charge) => {
        const ledgerRow = householdChargeToLedgerRow(charge);
        const chargeEmail = charge.residentEmail?.trim().toLowerCase() ?? "";
        const application = applications.find((row) => {
          if (charge.applicationId && row.id === charge.applicationId) return true;
          const rowEmail = row.email?.trim().toLowerCase();
          const rowPropertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
          return rowEmail === chargeEmail && rowPropertyId === charge.propertyId;
        });
        const roomChoice = application?.assignedRoomChoice?.trim() || application?.application?.roomChoice1?.trim() || "";
        const roomLabel = getRoomChoiceLabel(roomChoice).split(" · ")[0]?.trim() || "";
        return roomLabel ? { ...ledgerRow, roomNumber: roomLabel.replace(/^room\s+/i, "") } : ledgerRow;
      });
  }, [userId, ledgerDataVersion]);

  const residentOptions = useMemo(() => {
    void applicationTick;
    // Use readManagerApplicationRows as source of truth (same as Residents page)
    const applications = readManagerApplicationRows();
    const seen = new Map<string, string>();
    
    for (const app of applications) {
      // If property filter is active, only include residents from that property
      if (propertyFilter) {
        const appPropertyName = app.property?.trim() || "";
        if (normalizePropertyLabel(appPropertyName) !== propertyFilter) continue;
      }
      
      const name = app.name?.trim();
      if (!name) continue;
      if (!seen.has(name)) seen.set(name, name);
    }
    
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [propertyFilter, applicationTick]);

  const activeResidentFilter = residentOptions.some((option) => option.id === residentFilter) ? residentFilter : "";

  const rowsForCounts = useMemo(() => {
    return mergedRows.filter((row) => {
      if (propertyFilter && normalizePropertyLabel(row.propertyName) !== propertyFilter) return false;
      if (activeResidentFilter && row.residentName !== activeResidentFilter) return false;
      return true;
    });
  }, [mergedRows, propertyFilter, activeResidentFilter]);

  const counts = useMemo(() => {
    const c: Record<ManagerPaymentBucket, number> = { pending: 0, overdue: 0, paid: 0 };
    for (const r of rowsForCounts) {
      c[r.bucket] += 1;
    }
    return c;
  }, [rowsForCounts]);

  const propertyLabelById = useMemo(() => {
    void propertyTick;
    const map = new Map<string, string>();
    if (!userId) return map;
    for (const property of [...readExtraListingsForUser(userId)]) {
      const id = property.id.trim();
      const label = normalizePropertyLabel(property.buildingName.trim() || property.title);
      if (id && label) map.set(id, label);
    }
    return map;
  }, [userId, propertyTick]);

  const vendorById = useMemo(() => {
    void ledgerDataVersion;
    return new Map(readOwnActiveManagerVendorRows(userId).map((vendor) => [vendor.id, vendor]));
  }, [userId, ledgerDataVersion]);

  const outgoingRows = useMemo(() => {
    void ledgerDataVersion;
    const vendorNameById = new Map([...vendorById.entries()].map(([id, vendor]) => [id, vendor.name]));
    return buildManagerOutgoingPaymentRows({
      managerUserId: userId,
      expenses: readManagerOutgoingExpenses(),
      workOrders: readManagerWorkOrderRows(),
      propertyLabelById,
      vendorNameById,
      vendorById,
    });
  }, [userId, ledgerDataVersion, propertyLabelById, vendorById]);

  const outgoingRowsForCounts = useMemo(() => {
    return outgoingRows.filter((row) => {
      if (propertyFilter && normalizePropertyLabel(row.propertyName) !== propertyFilter) return false;
      return true;
    });
  }, [outgoingRows, propertyFilter]);

  const outgoingCounts = useMemo(() => {
    const c: Record<ManagerPaymentBucket, number> = { pending: 0, overdue: 0, paid: 0 };
    for (const row of outgoingRowsForCounts) c[row.bucket] += 1;
    return c;
  }, [outgoingRowsForCounts]);

  const outgoingRowsForBucket = useMemo(() => {
    return outgoingRowsForCounts.filter((row) => row.bucket === bucket);
  }, [outgoingRowsForCounts, bucket]);

  const propertyOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of mergedRows) {
      const key = normalizePropertyLabel(row.propertyName);
      if (!key) continue;
      if (!seen.has(key)) seen.set(key, key);
    }
    for (const row of outgoingRows) {
      const key = normalizePropertyLabel(row.propertyName);
      if (!key) continue;
      if (!seen.has(key)) seen.set(key, key);
    }
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [mergedRows, outgoingRows]);

  const tabs = useMemo(
    () =>
      PAY_LABELS.map(({ id, label }) => ({
        id,
        label,
        count: direction === "incoming" ? counts[id] : outgoingCounts[id],
        alert: id === "overdue" && (direction === "incoming" ? counts.overdue : outgoingCounts.overdue) > 0,
      })),
    [counts, outgoingCounts, direction],
  );
  const rowsForBucket = useMemo(() => {
    const filtered = mergedRows.filter((r) => {
      if (r.bucket !== bucket) return false;
      if (propertyFilter && normalizePropertyLabel(r.propertyName) !== propertyFilter) return false;
      if (activeResidentFilter && r.residentName !== activeResidentFilter) return false;
      return true;
    });

    // Order by due date: pending/overdue soonest-first (what's due next), paid most-recent-first.
    const direction = bucket === "paid" ? "desc" : "asc";
    return [...filtered].sort((a, b) => compareDueDateMs(a.dueDateSortMs, b.dueDateSortMs, direction));
  }, [mergedRows, bucket, propertyFilter, activeResidentFilter]);

  const filterRow = (
    <ManagerPortalFilterRow>
      <PillTabs
        items={DIRECTION_LABELS}
        activeId={direction}
        onChange={(id) => {
          setDirection(id as ManagerPaymentDirection);
          setBucket("pending");
          setResidentFilter("");
        }}
      />
      <div className="ml-auto flex min-w-0 flex-wrap items-center gap-3">
        <PortalPropertyFilterPill
          propertyOptions={propertyOptions}
          propertyValue={propertyFilter}
          onPropertyChange={(nextProperty) => {
            setPropertyFilter(nextProperty);
            setResidentFilter("");
          }}
          residents={direction === "incoming"}
          residentOptions={residentOptions}
          residentValue={activeResidentFilter}
          onResidentChange={setResidentFilter}
        />
      </div>
    </ManagerPortalFilterRow>
  );

  return (
    <ManagerPortalPageShell
      title="Payments"
      titleAside={
        <>
          {direction === "incoming" ? (
            <Button
              type="button"
              variant="outline"
              className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
              onClick={() => setReminderSettingsOpen(true)}
              data-attr="payments-reminder-settings"
            >
              Reminders
            </Button>
          ) : null}
          <PortalStripeConnectPanel
            basePath={portalBase}
            variant="header"
            onConnectDone={() => setBankLinkBanner(true)}
          />
          <Button
            type="button"
            variant="primary"
            className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
            onClick={() => (direction === "incoming" ? setAddOpen(true) : setAddOutgoingOpen(true))}
            data-attr="payments-add"
          >
            Add
          </Button>
        </>
      }
      filterRow={filterRow}
    >
      <div className="mt-1">
        <div className="mb-4">
          <ManagerPortalStatusPills
            tabs={tabs}
            activeId={bucket}
            onChange={(id) => setBucket(id as ManagerPaymentBucket)}
          />
        </div>
        {bankLinkBanner ? (
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm portal-banner-success">
            <p>
              <span className="font-semibold text-foreground">Bank account linked.</span> Resident payments will deposit to
              your connected account. You can update bank details anytime with Update.
            </p>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 rounded-full px-3 py-1 text-xs"
              onClick={() => setBankLinkBanner(false)}
            >
              Dismiss
            </Button>
          </div>
        ) : null}
        {direction === "incoming" ? (
          <ManagerPaymentsLedgerPanel
            rows={rowsForBucket}
            managerUserId={userId ?? null}
            activeBucket={bucket}
            scheduledMessages={scheduledMessages}
            reminderScheduleSummary={reminderScheduleSummary}
            onOpenReminderSettings={() => setReminderSettingsOpen(true)}
            onScheduleChanged={() => void reloadSchedule()}
            onRowsChanged={() => setHcTick((n) => n + 1)}
          />
        ) : (
          <ManagerOutgoingPaymentsPanel
            rows={outgoingRowsForBucket}
            activeBucket={bucket}
            vendorById={vendorById}
            onRowsChanged={() => {
              setOutgoingTick((n) => n + 1);
              void syncManagerOutgoingExpensesFromServer(true);
              void syncManagerWorkOrdersFromServer();
            }}
          />
        )}
      </div>
      <ReminderSettingsModal
        open={reminderSettingsOpen}
        onClose={() => setReminderSettingsOpen(false)}
        settings={reminderSettings}
        onSaved={(next) => {
          setReminderSettings(next);
          void reloadSchedule();
        }}
      />
      <ManagerAddPaymentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        managerUserId={userId ?? null}
        onSubmitted={() => {
          setAddOpen(false);
          setHcTick((n) => n + 1);
          void reloadSchedule();
        }}
      />
      <ManagerAddOutgoingPaymentModal
        open={addOutgoingOpen}
        onClose={() => setAddOutgoingOpen(false)}
        managerUserId={userId ?? null}
        onSubmitted={() => {
          setAddOutgoingOpen(false);
          setOutgoingTick((n) => n + 1);
          void syncManagerOutgoingExpensesFromServer(true);
        }}
      />

    </ManagerPortalPageShell>
  );
}
