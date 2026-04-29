"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { ManagerPaymentsLedgerPanel } from "@/components/portal/manager-payments-ledger-panel";
import { PortalStripeConnectPanel } from "@/components/portal/portal-stripe-connect-panel";
import { TabNav, type TabItem } from "@/components/ui/tabs";
import type { ManagerPaymentBucket } from "@/data/demo-portal";
import { mergeManagerPaymentLedger } from "@/lib/demo-manager-payment-ledger";
import {
  householdChargeToLedgerRow,
  HOUSEHOLD_CHARGES_EVENT,
  readChargesForManager,
  syncHouseholdChargesFromServer,
} from "@/lib/household-charges";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { ManagerAddPaymentModal } from "@/components/portal/manager-add-payment-modal";
import { usePaidPortalBasePath } from "@/lib/portal-base-path-client";
import {
  MANAGER_APPLICATIONS_EVENT,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import { getRoomChoiceLabel } from "@/lib/rental-application/data";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";

const PAY_LABELS: { id: ManagerPaymentBucket; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
];

type ManagerPaymentsView = "ledger" | "payouts";

export function ManagerPayments({ view = "ledger" }: { view?: ManagerPaymentsView }) {
  const { showToast } = useAppUi();
  const router = useRouter();
  const { userId, ready: authReady } = useManagerUserId();
  const portalBase = usePaidPortalBasePath();
  const [bucket, setBucket] = useState<ManagerPaymentBucket>("pending");
  const [hcTick, setHcTick] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [residentFilter, setResidentFilter] = useState("");
  const [applicationTick, setApplicationTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const ledgerDataVersion = `${hcTick}:${applicationTick}:${propertyTick}`;

  useEffect(() => {
    const on = () => setHcTick((n) => n + 1);
    void syncHouseholdChargesFromServer().then(on);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    return () => window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
  }, []);

  useEffect(() => {
    const on = () => setApplicationTick((n) => n + 1);
    void syncManagerApplicationsFromServer().then(on);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, on);
    return () => {
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, on);
    };
  }, []);

  useEffect(() => {
    if (!authReady || !userId) return;
    void syncPropertyPipelineFromServer().then(() => setPropertyTick((n) => n + 1));
  }, [authReady, userId]);

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
    }
    if (payouts === "1") {
      window.location.replace(`${portalBase}/payments/payouts`);
    } else if (connect === "done" || connect === "refresh") {
      window.location.replace(`${portalBase}/payments/payouts?connect=${encodeURIComponent(connect)}`);
    }
  }, [portalBase]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== "axis-stripe-connect") return;
      if (e.data?.connect === "done") {
        showToast("Payout status updated.");
      } else if (e.data?.connect === "refresh") {
        showToast("Setup link expired — open Payouts to try again.");
      }
      window.dispatchEvent(new Event("axis-stripe-connect-refresh"));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [showToast]);

  const mergedRows = useMemo(() => {
    void ledgerDataVersion;
    const applications = readManagerApplicationRows();
    return [
      ...readChargesForManager(userId).map((charge) => {
        const ledgerRow = householdChargeToLedgerRow(charge);
        const chargeEmail = charge.residentEmail.trim().toLowerCase();
        const application = applications.find((row) => {
          if (charge.applicationId && row.id === charge.applicationId) return true;
          const rowEmail = row.email?.trim().toLowerCase();
          const rowPropertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
          return rowEmail === chargeEmail && rowPropertyId === charge.propertyId;
        });
        const roomChoice = application?.assignedRoomChoice?.trim() || application?.application?.roomChoice1?.trim() || "";
        const roomLabel = getRoomChoiceLabel(roomChoice).split(" · ")[0]?.trim() || "";
        return roomLabel ? { ...ledgerRow, roomNumber: roomLabel.replace(/^room\s+/i, "") } : ledgerRow;
      }),
      ...mergeManagerPaymentLedger(),
    ];
  }, [userId, ledgerDataVersion]);

  const propertyOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of mergedRows) {
      const key = row.propertyName.trim();
      if (!key) continue;
      if (!seen.has(key)) seen.set(key, key);
    }
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [mergedRows]);

  const residentOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of mergedRows) {
      const key = row.residentName.trim();
      if (!key) continue;
      if (!seen.has(key)) seen.set(key, key);
    }
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [mergedRows]);

  const counts = useMemo(() => {
    const c: Record<ManagerPaymentBucket, number> = { pending: 0, overdue: 0, paid: 0 };
    for (const r of mergedRows) {
      c[r.bucket] += 1;
    }
    return c;
  }, [mergedRows]);

  const tabs = useMemo(
    () => PAY_LABELS.map(({ id, label }) => ({ id, label, count: counts[id] })),
    [counts],
  );
  const paymentTabs = useMemo<TabItem[]>(
    () => [
      { id: "ledger", label: "Ledger", href: `${portalBase}/payments/ledger` },
      { id: "payouts", label: "Payouts", href: `${portalBase}/payments/payouts` },
    ],
    [portalBase],
  );

  const rowsForBucket = useMemo(() => {
    return mergedRows.filter((r) => {
      if (r.bucket !== bucket) return false;
      if (propertyFilter && r.propertyName !== propertyFilter) return false;
      if (residentFilter && r.residentName !== residentFilter) return false;
      return true;
    });
  }, [mergedRows, bucket, propertyFilter, residentFilter]);

  const filterRow = (
    <div className="flex flex-col gap-4">
      <TabNav items={paymentTabs} activeId={view} />
      {view === "ledger" ? (
        <>
          <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 text-sm text-slate-800">
            Set up <span className="font-semibold">Payouts</span> before creating a listing.{" "}
            <button
              type="button"
              className="font-semibold text-primary underline underline-offset-2 hover:text-primary/90"
              onClick={() => router.push(`${portalBase}/payments/payouts`)}
            >
              Open Payouts
            </button>
          </div>
          <ManagerPortalStatusPills tabs={tabs} activeId={bucket} onChange={(id) => setBucket(id as ManagerPaymentBucket)} />
        </>
      ) : null}
    </div>
  );

  if (view === "payouts") {
    return (
      <ManagerPortalPageShell title="Payments" filterRow={filterRow}>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <PortalStripeConnectPanel variant="embedded" basePath={portalBase} />
        </div>
      </ManagerPortalPageShell>
    );
  }

  return (
    <ManagerPortalPageShell
      title="Payments"
      titleAside={
        <>
          <PortalPropertyFilterPill
            propertyOptions={propertyOptions}
            propertyValue={propertyFilter}
            onPropertyChange={setPropertyFilter}
            residents
            residentOptions={residentOptions}
            residentValue={residentFilter}
            onResidentChange={setResidentFilter}
          />
          <Button type="button" variant="primary" className="shrink-0 rounded-full" onClick={() => setAddOpen(true)}>
            Add payment
          </Button>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 rounded-full"
            onClick={() => {
              void Promise.all([
                syncHouseholdChargesFromServer(),
                syncManagerApplicationsFromServer({ force: true }),
                syncPropertyPipelineFromServer({ force: true }),
              ]).then(() => {
                setHcTick((n) => n + 1);
                setApplicationTick((n) => n + 1);
                setPropertyTick((n) => n + 1);
                showToast("Payments refreshed.");
              });
            }}
          >
            Refresh
          </Button>
        </>
      }
      filterRow={filterRow}
    >
      <ManagerPaymentsLedgerPanel
        rows={rowsForBucket}
        managerUserId={userId ?? null}
        activeBucket={bucket}
        onRowsChanged={() => setHcTick((n) => n + 1)}
      />
      <ManagerAddPaymentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmitted={() => {
          showToast("Payment line added.");
          setAddOpen(false);
        }}
      />

    </ManagerPortalPageShell>
  );
}
