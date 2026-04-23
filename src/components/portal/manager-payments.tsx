"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { ManagerPaymentsLedgerPanel } from "@/components/portal/manager-payments-ledger-panel";
import { PortalStripeConnectPanel } from "@/components/portal/portal-stripe-connect-panel";
import { ManagerPayoutSplitsForm } from "@/components/portal/manager-payout-splits-form";
import type { ManagerPaymentBucket } from "@/data/demo-portal";
import { mergeManagerPaymentLedger } from "@/lib/demo-manager-payment-ledger";
import { householdChargeToLedgerRow, HOUSEHOLD_CHARGES_EVENT, readChargesForManager } from "@/lib/household-charges";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { ManagerAddPaymentModal } from "@/components/portal/manager-add-payment-modal";
import { usePaidPortalBasePath } from "@/lib/portal-base-path-client";

const PAY_LABELS: { id: ManagerPaymentBucket; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
];

export function ManagerPayments({ tab = "ledger" }: { tab?: "ledger" | "payouts" }) {
  const { showToast } = useAppUi();
  const { userId } = useManagerUserId();
  const portalBase = usePaidPortalBasePath();
  const [bucket, setBucket] = useState<ManagerPaymentBucket>("pending");
  const [hcTick, setHcTick] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [payoutsOpen, setPayoutsOpen] = useState(false);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [residentFilter, setResidentFilter] = useState("");

  useEffect(() => {
    const on = () => setHcTick((n) => n + 1);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    return () => window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
  }, []);

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
    if (payouts === "1" || connect === "done" || connect === "refresh") {
      setPayoutsOpen(true);
      if (connect === "done") {
        showToast("Payout status updated.");
        window.dispatchEvent(new Event("axis-stripe-connect-refresh"));
      } else if (connect === "refresh") {
        showToast("Setup link expired — open Payouts to try again.");
        window.dispatchEvent(new Event("axis-stripe-connect-refresh"));
      }
      params.delete("payouts");
      params.delete("connect");
      const next = params.toString();
      const path = `${window.location.pathname}${next ? `?${next}` : ""}`;
      window.history.replaceState({}, "", path);
    }
  }, [showToast]);

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
    void hcTick;
    const fromHc = readChargesForManager(userId).map(householdChargeToLedgerRow);
    return [...fromHc, ...mergeManagerPaymentLedger()];
  }, [userId, hcTick]);

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

  const rowsForBucket = useMemo(() => {
    return mergedRows.filter((r) => {
      if (r.bucket !== bucket) return false;
      if (propertyFilter && r.propertyName !== propertyFilter) return false;
      if (residentFilter && r.residentName !== residentFilter) return false;
      return true;
    });
  }, [mergedRows, bucket, propertyFilter, residentFilter]);

  if (tab === "payouts") {
    return (
      <ManagerPortalPageShell title="Payments">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <PortalStripeConnectPanel variant="embedded" basePath={portalBase} />
          </div>
          <ManagerPayoutSplitsForm />
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
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => setPayoutsOpen(true)}>
            Payouts
          </Button>
          <Button type="button" variant="primary" className="shrink-0 rounded-full" onClick={() => setAddOpen(true)}>
            Add payment
          </Button>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 rounded-full"
            onClick={() => {
              setHcTick((n) => n + 1);
              showToast("Payments refreshed.");
            }}
          >
            Refresh
          </Button>
        </>
      }
      filterRow={
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 text-sm text-slate-800">
            Set up <span className="font-semibold">Payouts</span> before creating a listing.{" "}
            <button
              type="button"
              className="font-semibold text-primary underline underline-offset-2 hover:text-primary/90"
              onClick={() => setPayoutsOpen(true)}
            >
              Open Payouts
            </button>
          </div>
          <ManagerPortalStatusPills tabs={tabs} activeId={bucket} onChange={(id) => setBucket(id as ManagerPaymentBucket)} />
        </div>
      }
    >
      <ManagerPaymentsLedgerPanel rows={rowsForBucket} managerUserId={userId ?? null} activeBucket={bucket} />
      <ManagerAddPaymentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmitted={() => {
          showToast("Payment line added.");
          setAddOpen(false);
        }}
      />

      <Modal
        open={payoutsOpen}
        title="Payouts"
        onClose={() => setPayoutsOpen(false)}
        panelClassName="relative z-[71] max-h-[90vh] w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-2xl"
      >
        <PortalStripeConnectPanel variant="embedded" basePath={portalBase} />
      </Modal>
    </ManagerPortalPageShell>
  );
}
