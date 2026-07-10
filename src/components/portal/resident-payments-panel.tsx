"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TabNav } from "@/components/ui/tabs";
import { useSearchParams, useRouter } from "next/navigation";
import { track } from "@/lib/analytics/track-client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { StripeEmbeddedCheckout } from "@/components/stripe-embedded-checkout";
import { ManagerPortalFilterRow, ManagerPortalPageShell, ManagerPortalStatusPills, PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import {
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PortalTableDetailActions,
} from "@/components/portal/portal-data-table";
import { PortalPaymentsTable, type PortalPaymentTableRow } from "@/components/portal/portal-payments-table";
import { usePortalSession } from "@/hooks/use-portal-session";
import { useNativePlatform } from "@/hooks/use-native-platform";
import {
  chargeDueLabel,
  compareChargesByDueDate,
  HOUSEHOLD_CHARGES_EVENT,
  HOUSEHOLD_CHARGES_SESSION_KEY,
  isHouseholdChargeOverdue,
  linkHouseholdChargesToResidentUser,
  readChargesForResident,
  reportResidentManualPayment,
  syncHouseholdChargesFromServer,
  type HouseholdCharge,
} from "@/lib/household-charges";
import { syncManagerApplicationsFromServer } from "@/lib/manager-applications-storage";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import {
  LEASE_PIPELINE_EVENT,
  findLeaseForResidentEmail,
  hasBothLeaseSignatures,
  syncLeasePipelineFromServer,
} from "@/lib/lease-pipeline-storage";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { CANONICAL_DEMO_MANAGER_NAME } from "@/lib/demo/demo-canonical-accounts";
import { canPayHouseholdChargeWithAxisAch } from "@/lib/household-charge-payment-eligibility";
import {
  residentPaymentMethodLabel,
  residentProcessingFeeDisplayLabel,
  type ResidentAxisPaymentMethod,
} from "@/lib/payment-policy";
import { nativePlatformRequestHeaders } from "@/lib/platform/native-client";
import {
  availableManualChannelsForCharges,
  filterChargesForPayMethod,
  isPayableHouseholdCharge,
  isStripeResidentPayMethod,
  manualContactForCharges,
  residentManualPaymentMethodLabel,
  residentPaymentMethodsForSurface,
  type ResidentManualPaymentChannel,
  type ResidentPayMethod,
} from "@/lib/platform/resident-payments";
import { safeFormatDateTime } from "@/lib/pacific-time";


type PayConfirmState = {
  chargeIds: string[];
  method: ResidentPayMethod;
};

type CheckoutState = {
  key: string;
  chargeIds: string[];
  paymentMethod: ResidentAxisPaymentMethod;
  clientSecret: string | null;
  loading: boolean;
  error: string | null;
  subtotalCents?: number;
  processingFeeCents?: number;
  axisFeeCents?: number;
  totalCents?: number;
};

const CHECKOUT_METHOD_OPTIONS: {
  id: ResidentAxisPaymentMethod;
  title: string;
}[] = [
  { id: "ach", title: "Bank (ACH)" },
  { id: "card", title: "Credit card" },
  { id: "link", title: "Link" },
];

const MANUAL_METHOD_OPTIONS: { id: ResidentManualPaymentChannel; title: string }[] = [
  { id: "zelle", title: "Zelle" },
  { id: "venmo", title: "Venmo" },
];

type SavedPaymentMethod = {
  id: string;
  type: "card" | "us_bank_account";
  label: string;
  isDefault: boolean;
};

function centsFromLabel(label: string): number {
  const n = Number(label.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function checkoutKey(chargeIds: string[], paymentMethod: ResidentAxisPaymentMethod): string {
  return `${[...chargeIds].sort().join(",")}:${paymentMethod}`;
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

type PaymentStatusBucket = "overdue" | "pending" | "paid";

export function ResidentPaymentsPanel({
  tabId = "pending",
  basePath = "/resident",
}: {
  tabId?: string;
  basePath?: string;
}) {
  const { showToast } = useAppUi();
  const searchParams = useSearchParams();
  const router = useRouter();
  const session = usePortalSession();
  const nativePlatform = useNativePlatform();
  const isNativeApp = nativePlatform !== null;
  const availablePaymentMethods = useMemo(
    () => residentPaymentMethodsForSurface(isNativeApp),
    [isNativeApp],
  );
  const paymentMethodOptions = useMemo(
    () => CHECKOUT_METHOD_OPTIONS.filter((option) => availablePaymentMethods.includes(option.id)),
    [availablePaymentMethods],
  );
  const preferredMethodOptions = useMemo(
    () => paymentMethodOptions.filter((option) => option.id === "ach" || option.id === "card"),
    [paymentMethodOptions],
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bucket, setBucket] = useState<PaymentStatusBucket>(
    tabId === "paid" ? "paid" : "pending",
  );
  const [bucketTouched, setBucketTouched] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [paymentMethod, setPaymentMethod] = useState<ResidentPayMethod>("ach");
  const [payConfirm, setPayConfirm] = useState<PayConfirmState | null>(null);
  const [manualSentConfirmed, setManualSentConfirmed] = useState(false);
  const [reportingManualPayment, setReportingManualPayment] = useState(false);
  const [tick, setTick] = useState(0);
  const [checkout, setCheckout] = useState<CheckoutState | null>(null);
  const [paymentMethodModalOpen, setPaymentMethodModalOpen] = useState(false);
  const [savedMethods, setSavedMethods] = useState<SavedPaymentMethod[]>([]);
  const [savedMethodsLoading, setSavedMethodsLoading] = useState(false);
  const [setupCheckout, setSetupCheckout] = useState<{ kind: "card" | "ach"; clientSecret: string } | null>(null);
  const [setupLoading, setSetupLoading] = useState<"card" | "ach" | null>(null);
  const [leaseTick, setLeaseTick] = useState(0);
  const email = session.email?.trim() ?? null;
  const userId = session.userId;

  const residentLeaseRow = useMemo(() => {
    void leaseTick;
    if (!email) return null;
    return findLeaseForResidentEmail(email);
  }, [email, leaseTick]);

  const paymentsUnlocked = Boolean(residentLeaseRow && hasBothLeaseSignatures(residentLeaseRow));

  useEffect(() => {
    if (isStripeResidentPayMethod(paymentMethod) && !availablePaymentMethods.includes(paymentMethod)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fall back when surface policy changes
      setPaymentMethod(availablePaymentMethods[0] ?? "ach");
      setCheckout(null);
    }
  }, [availablePaymentMethods, paymentMethod]);

  const charges = useMemo(() => {
    void tick;
    if (!email) return [] as HouseholdCharge[];
    return readChargesForResident(email, userId);
  }, [email, userId, tick]);

  const unpaidPayableCharges = useMemo(
    () => charges.filter((c) => isPayableHouseholdCharge(c)),
    [charges],
  );

  const unpaidAchCharges = useMemo(
    () => charges.filter((c) => c.status === "pending" && canPayHouseholdChargeWithAxisAch(c)),
    [charges],
  );

  const availableManualChannels = useMemo(
    () => availableManualChannelsForCharges(unpaidPayableCharges),
    [unpaidPayableCharges],
  );

  useEffect(() => {
    if (
      !isStripeResidentPayMethod(paymentMethod) &&
      !availableManualChannels.includes(paymentMethod)
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fall back when manual channels change
      setPaymentMethod(availablePaymentMethods[0] ?? availableManualChannels[0] ?? "ach");
      setCheckout(null);
    }
  }, [availableManualChannels, availablePaymentMethods, paymentMethod]);

  const reloadSavedMethods = useCallback(async () => {
    if (isDemoModeActive()) {
      setSavedMethods([]);
      return;
    }
    setSavedMethodsLoading(true);
    try {
      const res = await fetch("/api/stripe/resident-payment-methods", { credentials: "include", cache: "no-store" });
      const data = (await res.json()) as { methods?: SavedPaymentMethod[] };
      setSavedMethods(Array.isArray(data.methods) ? data.methods : []);
    } catch {
      setSavedMethods([]);
    } finally {
      setSavedMethodsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!paymentMethodModalOpen) {
      setSetupCheckout(null);
      return;
    }
    void reloadSavedMethods();
  }, [paymentMethodModalOpen, reloadSavedMethods]);

  useEffect(() => {
    if (searchParams.get("payment_method") !== "added") return;
    void reloadSavedMethods();
    setPaymentMethodModalOpen(true);
    router.replace("/resident/payments", { scroll: false });
  }, [reloadSavedMethods, router, searchParams]);

  const startAddPaymentMethod = useCallback(
    async (kind: "card" | "ach") => {
      if (isDemoModeActive()) {
        showToast("Payment methods are unavailable in demo mode.");
        return;
      }
      setSetupLoading(kind);
      try {
        const returnUrl = `${window.location.origin}/resident/payments?payment_method=added`;
        const res = await fetch("/api/stripe/resident-payment-methods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ kind, returnUrl }),
        });
        const data = (await res.json()) as { clientSecret?: string; error?: string };
        if (!res.ok || !data.clientSecret) {
          showToast(data.error ?? "Could not add payment method.");
          return;
        }
        setSetupCheckout({ kind, clientSecret: data.clientSecret });
      } finally {
        setSetupLoading(null);
      }
    },
    [showToast],
  );

  const refresh = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    const on = () => refresh();
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    const onStorage = (e: StorageEvent) => {
      if (e.key === HOUSEHOLD_CHARGES_SESSION_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  useEffect(() => {
    const onLease = () => setLeaseTick((t) => t + 1);
    window.addEventListener(LEASE_PIPELINE_EVENT, onLease);
    return () => window.removeEventListener(LEASE_PIPELINE_EVENT, onLease);
  }, []);

  useEffect(() => {
    if (!paymentsUnlocked) {
      setCheckout(null);
      setPayConfirm(null);
      setPaymentMethodModalOpen(false);
    }
  }, [paymentsUnlocked]);

  useEffect(() => {
    if (!session.ready) return;
    if (session.userId && email) linkHouseholdChargesToResidentUser(email, session.userId);
    void (async () => {
      await syncManagerApplicationsFromServer({ force: true });
      await syncPropertyPipelineFromServer({ force: true });
      await syncLeasePipelineFromServer();
      await syncHouseholdChargesFromServer(true, { skipReconcile: true });
    })().finally(refresh);
  }, [email, refresh, session.ready, session.userId]);

  useEffect(() => {
    const achCheckout = searchParams.get("ach_checkout");
    const sessionId = searchParams.get("session_id")?.trim();
    if (!achCheckout || !sessionId) return;

    if (achCheckout === "cancel") {
      showToast("Bank payment cancelled.");
      router.replace("/resident/payments");
      return;
    }

    if (achCheckout !== "success" && achCheckout !== "return") return;

    void (async () => {
      const res = await fetch(`/api/stripe/household-charge-verify?session_id=${encodeURIComponent(sessionId)}`);
      const data = (await res.json().catch(() => ({}))) as {
        paid?: boolean;
        processing?: boolean;
        error?: string;
      };

      if (!res.ok) {
        showToast(typeof data.error === "string" ? data.error : "Could not verify bank payment.");
        router.replace("/resident/payments");
        return;
      }

      if (data.paid) {
        await syncHouseholdChargesFromServer(true, { skipReconcile: true });
        refresh();
        setCheckout(null);
        setSelectedIds(new Set());
        showToast("Payment received — thank you.");
      } else if (data.processing) {
        showToast("Bank transfer submitted. We will mark this paid when the transfer clears (usually 3–5 business days).");
      } else {
        showToast(typeof data.error === "string" ? data.error : "Payment not completed yet.");
      }
      router.replace("/resident/payments");
    })();
  }, [refresh, router, searchParams, showToast]);

  const rows = useMemo(() => {
    return [...charges].sort((a, b) => {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      if (a.status === "pending") {
        const aOverdue = isHouseholdChargeOverdue(a);
        const bOverdue = isHouseholdChargeOverdue(b);
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        // Soonest due first among what's still owed.
        return compareChargesByDueDate(a, b, "asc");
      }
      // Paid history: most recently due first.
      return compareChargesByDueDate(a, b, "desc");
    });
  }, [charges]);

  const pendingRows = useMemo(() => rows.filter((c) => c.status === "pending"), [rows]);
  const overdueRows = useMemo(
    () => pendingRows.filter((c) => isHouseholdChargeOverdue(c)),
    [pendingRows],
  );
  const upcomingPendingRows = useMemo(
    () => pendingRows.filter((c) => !isHouseholdChargeOverdue(c)),
    [pendingRows],
  );
  const paidRows = useMemo(() => rows.filter((c) => c.status === "paid"), [rows]);
  const rowsForBucket = useMemo(() => {
    if (bucket === "overdue") return overdueRows;
    if (bucket === "pending") return upcomingPendingRows;
    return paidRows;
  }, [bucket, overdueRows, upcomingPendingRows, paidRows]);

  const bucketCounts = useMemo(
    () => ({
      overdue: overdueRows.length,
      pending: upcomingPendingRows.length,
      paid: paidRows.length,
    }),
    [overdueRows.length, upcomingPendingRows.length, paidRows.length],
  );

  useEffect(() => {
    if (bucketTouched || !email) return;
    // Default tab is Pending.
  }, [bucketTouched, email, overdueRows.length]);

  const statusTabs = useMemo(
    () =>
      [
        {
          id: "pending" as const,
          label: "Pending",
          count: bucketCounts.pending,
          dataAttr: "resident-payments-tab-pending",
        },
        {
          id: "overdue" as const,
          label: "Overdue",
          count: bucketCounts.overdue,
          alert: bucketCounts.overdue > 0,
          dataAttr: "resident-payments-tab-overdue",
        },
        {
          id: "paid" as const,
          label: "Paid",
          count: bucketCounts.paid,
          dataAttr: "resident-payments-tab-paid",
        },
      ] as const,
    [bucketCounts],
  );

  const allBucketSelected = useMemo(
    () => rowsForBucket.length > 0 && rowsForBucket.every((charge) => selectedIds.has(charge.id)),
    [rowsForBucket, selectedIds],
  );

  const toggleSelectAllBucket = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected = rowsForBucket.every((charge) => prev.has(charge.id));
      const next = new Set(prev);
      if (allSelected) {
        for (const charge of rowsForBucket) next.delete(charge.id);
      } else {
        for (const charge of rowsForBucket) next.add(charge.id);
      }
      return next;
    });
  }, [rowsForBucket]);

  const loadCheckout = useCallback(
    async (chargeIds: string[], method: ResidentAxisPaymentMethod) => {
      const ids = [...new Set(chargeIds.map((id) => id.trim()).filter(Boolean))];
      if (ids.length === 0) return;
      // In the public /demo sandbox there is no real Stripe session and the
      // checkout route requires auth — keep the visitor inside the demo.
      if (isDemoModeActive()) {
        showToast("Payments are simulated in this demo.");
        return;
      }
      const key = checkoutKey(ids, method);
      setCheckout({ key, chargeIds: ids, paymentMethod: method, clientSecret: null, loading: true, error: null });
      track("household_charge_payment_started", { method, charge_count: ids.length });
      try {
        const res = await fetch("/api/stripe/household-charge-checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...nativePlatformRequestHeaders(nativePlatform),
          },
          body: JSON.stringify({ chargeIds: ids, embedded: true, paymentMethod: method }),
        });
        const payload = (await res.json().catch(() => ({}))) as {
          clientSecret?: string;
          url?: string;
          error?: string;
          subtotalCents?: number;
          processingFeeCents?: number;
          axisFeeCents?: number;
          totalCents?: number;
        };
        if (!res.ok) {
          setCheckout({
            key,
            chargeIds: ids,
            paymentMethod: method,
            clientSecret: null,
            loading: false,
            error: typeof payload.error === "string" ? payload.error : "Could not start payment.",
          });
          return;
        }
        if (payload.clientSecret) {
          setCheckout({
            key,
            chargeIds: ids,
            paymentMethod: method,
            clientSecret: payload.clientSecret,
            loading: false,
            error: null,
            subtotalCents: payload.subtotalCents,
            processingFeeCents: payload.processingFeeCents,
            axisFeeCents: payload.axisFeeCents,
            totalCents: payload.totalCents,
          });
          return;
        }
        if (payload.url && typeof window !== "undefined") {
          window.location.href = payload.url;
        }
      } catch {
        setCheckout({
          key,
          chargeIds: ids,
          paymentMethod: method,
          clientSecret: null,
          loading: false,
          error: "Could not start payment.",
        });
      }
    },
    [nativePlatform, showToast],
  );

  const openPayConfirm = useCallback((chargeIds: string[], method: ResidentPayMethod) => {
    const ids = [...new Set(chargeIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) return;
    setManualSentConfirmed(false);
    setPayConfirm({ chargeIds: ids, method });
  }, []);

  const confirmStripePayment = useCallback(async () => {
    if (!payConfirm || !isStripeResidentPayMethod(payConfirm.method)) return;
    const ids = payConfirm.chargeIds;
    setPayConfirm(null);
    setExpandedId(null);
    await loadCheckout(ids, payConfirm.method);
  }, [loadCheckout, payConfirm]);

  const confirmManualPayment = useCallback(async () => {
    if (!payConfirm || isStripeResidentPayMethod(payConfirm.method)) return;
    if (!manualSentConfirmed) {
      showToast("Confirm that you sent the payment.");
      return;
    }
    setReportingManualPayment(true);
    try {
      const result = await reportResidentManualPayment(payConfirm.chargeIds, payConfirm.method);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      setPayConfirm(null);
      setSelectedIds(new Set());
      setExpandedId(null);
      refresh();
      showToast("Thanks — your manager will verify and mark this paid when they receive it.");
    } finally {
      setReportingManualPayment(false);
    }
  }, [manualSentConfirmed, payConfirm, refresh, showToast]);

  const toggleSelected = (chargeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(chargeId)) next.delete(chargeId);
      else next.add(chargeId);
      return next;
    });
  };

  const selectedPayableIds = useMemo(
    () =>
      [...selectedIds].filter((id) => {
        const charge = unpaidPayableCharges.find((c) => c.id === id);
        return charge && filterChargesForPayMethod([charge], paymentMethod).length > 0;
      }),
    [selectedIds, unpaidPayableCharges, paymentMethod],
  );

  const hasPartialSelection =
    selectedPayableIds.length > 0 && selectedPayableIds.length < unpaidPayableCharges.length;

  const payHeaderAction = () => {
    const pool = filterChargesForPayMethod(unpaidPayableCharges, paymentMethod);
    const ids = hasPartialSelection
      ? filterChargesForPayMethod(
          unpaidPayableCharges.filter((c) => selectedPayableIds.includes(c.id)),
          paymentMethod,
        ).map((c) => c.id)
      : pool.map((c) => c.id);
    if (ids.length === 0) {
      showToast(`No selected charges can be paid with ${isStripeResidentPayMethod(paymentMethod) ? residentPaymentMethodLabel(paymentMethod) : residentManualPaymentMethodLabel(paymentMethod)}.`);
      return;
    }
    if (!hasPartialSelection) setSelectedIds(new Set(ids));
    openPayConfirm(ids, paymentMethod);
  };

  const showCheckoutInExpandedRow = Boolean(
    checkout && expandedId && checkout.chargeIds.includes(expandedId),
  );
  const showBulkCheckoutBar = Boolean(
    checkout && checkout.chargeIds.length > 1 && !showCheckoutInExpandedRow,
  );

  const renderPaymentMethodPicker = (scopeCharges: HouseholdCharge[] = unpaidPayableCharges) => {
    const manualOptions = MANUAL_METHOD_OPTIONS.filter((option) =>
      availableManualChannelsForCharges(scopeCharges).includes(option.id),
    );
    const options = [
      ...paymentMethodOptions.map((option) => ({ ...option, feeLabel: residentProcessingFeeDisplayLabel(option.id) })),
      ...manualOptions.map((option) => ({ ...option, feeLabel: "No processing fee" })),
    ];
    return (
      <div className={`grid gap-2 ${options.length > 2 ? "sm:grid-cols-3" : "grid-cols-2"}`}>
        {options.map((option) => {
          const selected = paymentMethod === option.id;
          return (
            <button
              key={option.id}
              type="button"
              data-attr={`resident-payments-method-${option.id}`}
              onClick={() => {
                setPaymentMethod(option.id);
                setCheckout(null);
              }}
              className={`rounded-xl border px-3 py-3 text-left transition ${
                selected
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-card hover:border-primary/30"
              }`}
            >
              <p className="text-sm font-semibold text-foreground">{option.title}</p>
              <p className="mt-1 text-xs text-muted">{option.feeLabel}</p>
            </button>
          );
        })}
      </div>
    );
  };

  const renderCheckoutBlock = (label: string) => {
    if (!checkout) return null;
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {renderPaymentMethodPicker(
          checkout.chargeIds
            .map((id) => charges.find((c) => c.id === id))
            .filter((c): c is HouseholdCharge => Boolean(c)),
        )}
        {checkout.totalCents != null && checkout.subtotalCents != null ? (
          <p className="text-xs text-muted">
            Subtotal {formatUsd(checkout.subtotalCents)}
            {checkout.processingFeeCents ? ` · Processing ${formatUsd(checkout.processingFeeCents)}` : ""}
            {checkout.axisFeeCents ? ` · Axis fee ${formatUsd(checkout.axisFeeCents)}` : ""}
            {" · "}
            <span className="font-semibold text-foreground">Total {formatUsd(checkout.totalCents)}</span>
          </p>
        ) : null}
        {checkout.loading ? (
          <p className="text-sm text-muted">Loading secure checkout…</p>
        ) : checkout.error ? (
          <p className="rounded-xl border px-4 py-3 text-sm portal-banner-danger">{checkout.error}</p>
        ) : checkout.clientSecret ? (
          <StripeEmbeddedCheckout clientSecret={checkout.clientSecret} />
        ) : null}
      </div>
    );
  };

  const renderRowDetail = (row: HouseholdCharge) => {
    const payable = isPayableHouseholdCharge(row);
    const achPayable = row.status === "pending" && canPayHouseholdChargeWithAxisAch(row);
    const rowPayIds =
      selectedIds.has(row.id) && selectedIds.size > 1
        ? filterChargesForPayMethod(
            unpaidPayableCharges.filter((c) => selectedIds.has(c.id)),
            paymentMethod,
          ).map((c) => c.id)
        : filterChargesForPayMethod([row], paymentMethod).map((c) => c.id);
    return (
      <>
        <p className="mb-3 text-sm text-muted">
          Due: <span className="font-semibold text-foreground">{chargeDueLabel(row)}</span>
        </p>
        {row.manualPaymentReportedAt && row.manualPaymentChannel ? (
          <div className="glass-card mb-4 rounded-lg px-3 py-2.5 text-[var(--status-pending-fg)]">
            <p className="text-xs font-semibold">
              {residentManualPaymentMethodLabel(row.manualPaymentChannel)} payment reported
            </p>
            <p className="mt-1 text-sm leading-relaxed">
              You reported sending this via {residentManualPaymentMethodLabel(row.manualPaymentChannel)} on{" "}
              {safeFormatDateTime(row.manualPaymentReportedAt)}. Your manager will verify and mark it paid when they
              receive it.
            </p>
          </div>
        ) : null}
        {row.zelleContactSnapshot ? (
          <div className="glass-card mb-4 rounded-lg px-3 py-2.5 text-[var(--status-confirmed-fg)]">
            <p className="text-xs font-semibold">Pay with Zelle</p>
            <p className="mt-1 text-sm leading-relaxed">
              Send to <span className="font-mono font-medium">{row.zelleContactSnapshot}</span>. Include your name and unit in
              the memo. Your manager marks this paid when they receive it.
            </p>
          </div>
        ) : null}
        {row.venmoContactSnapshot ? (
          <div className="glass-card mb-4 rounded-lg px-3 py-2.5 text-[var(--status-approved-fg)]">
            <p className="text-xs font-semibold">Pay with Venmo</p>
            <p className="mt-1 text-sm leading-relaxed">
              Send to <span className="font-mono font-medium">{row.venmoContactSnapshot}</span>. Include your name and unit in
              the note. Your manager marks this paid when they receive it.
            </p>
          </div>
        ) : null}
        {payable && rowPayIds.length > 0 ? (
          <div className="mb-4">
            {achPayable && checkout && checkout.chargeIds.includes(row.id) ? (
              renderCheckoutBlock(
                checkout.chargeIds.length > 1
                  ? `Pay ${checkout.chargeIds.length} selected charges`
                  : `Pay online (${residentPaymentMethodLabel(checkout.paymentMethod)})`,
              )
            ) : (
              renderPaymentMethodPicker(
                rowPayIds
                  .map((id) => charges.find((c) => c.id === id))
                  .filter((c): c is HouseholdCharge => Boolean(c)),
              )
            )}
          </div>
        ) : !row.zelleContactSnapshot && !row.venmoContactSnapshot && !achPayable ? (
          <p className="mb-4 leading-relaxed">
            All charges are updated by your manager when they receive payment via Zelle, Venmo, ACH, or cash.
          </p>
        ) : null}
        {row.status === "paid" && row.paidAt ? (
          <p className="mt-2 text-xs text-muted">Marked paid {safeFormatDateTime(row.paidAt)}</p>
        ) : null}
        {row.blocksLeaseUntilPaid && row.status === "pending" ? (
          <p className="mt-3 text-sm text-amber-900">
            Pay this before signing your lease.{" "}
            <Link href="/resident/lease" className="font-semibold text-primary underline underline-offset-2">
              Open lease tab
            </Link>
            .
          </p>
        ) : null}
      </>
    );
  };

  const showSelectCol = rowsForBucket.length > 0;

  const chargeById = useMemo(() => new Map(charges.map((row) => [row.id, row])), [charges]);

  const residentPayeeLabel = isDemoModeActive() ? CANONICAL_DEMO_MANAGER_NAME : "Property manager";

  const tableRows = useMemo<PortalPaymentTableRow[]>(
    () =>
      rowsForBucket.map((row) => ({
        id: row.id,
        charge: row.title,
        property: row.propertyLabel,
        payee: residentPayeeLabel,
        dueDate: chargeDueLabel(row),
        // Face amount of the charge (paid rows have a $0.00 balance); the Pay
        // button below still uses the outstanding balanceLabel.
        amount: row.amountLabel,
      })),
    [rowsForBucket, residentPayeeLabel],
  );

  const renderExpandedActions = (tr: PortalPaymentTableRow) => {
    const row = chargeById.get(tr.id);
    if (!row) return null;
    const payable = isPayableHouseholdCharge(row);
    const rowPayIds = filterChargesForPayMethod([row], paymentMethod).map((c) => c.id);
    const manualReportable =
      payable &&
      rowPayIds.length > 0 &&
      !isStripeResidentPayMethod(paymentMethod) &&
      (paymentMethod === "zelle" || paymentMethod === "venmo");
    return (
      <PortalTableDetailActions>
        {payable && rowPayIds.length > 0 ? (
          <Button
            type="button"
            variant="primary"
            className={PORTAL_DETAIL_BTN}
            data-attr="resident-payments-row-pay"
            onClick={(event) => {
              event.stopPropagation();
              openPayConfirm(rowPayIds, paymentMethod);
            }}
          >
            Pay {row.balanceLabel}
          </Button>
        ) : null}
        {manualReportable ? (
          <Button
            type="button"
            variant="outline"
            className={PORTAL_DETAIL_BTN}
            data-attr="resident-payments-report-sent"
            onClick={(event) => {
              event.stopPropagation();
              openPayConfirm(rowPayIds, paymentMethod);
            }}
          >
            Report sent
          </Button>
        ) : null}
      </PortalTableDetailActions>
    );
  };

  const checkoutMethodOptions = useMemo(() => {
    const manualOptions = MANUAL_METHOD_OPTIONS.filter((option) =>
      availableManualChannels.includes(option.id),
    );
    return [...preferredMethodOptions, ...manualOptions];
  }, [availableManualChannels, preferredMethodOptions]);

  const confirmCharges = useMemo(() => {
    if (!payConfirm) return [] as HouseholdCharge[];
    return payConfirm.chargeIds
      .map((id) => charges.find((c) => c.id === id))
      .filter((c): c is HouseholdCharge => Boolean(c));
  }, [charges, payConfirm]);

  const confirmTotalLabel = useMemo(() => {
    const cents = confirmCharges.reduce((sum, c) => sum + centsFromLabel(c.balanceLabel), 0);
    return formatUsd(cents);
  }, [confirmCharges]);

  useEffect(() => {
    if (tabId === "paid" || tabId === "pending") {
      setBucket(tabId === "paid" ? "paid" : "pending");
    }
  }, [tabId]);

  const paymentTabItems = useMemo(
    () => [
      { id: "pending", label: "Pending", href: `${basePath}/payments/pending` },
      { id: "paid", label: "Paid", href: `${basePath}/payments/paid` },
      { id: "balance", label: "Balance", href: `${basePath}/payments/balance` },
      { id: "statements", label: "Statements", href: `${basePath}/payments/statements` },
    ],
    [basePath],
  );

  return (
    <>
    <ManagerPortalPageShell
      title="Payments"
      titleAside={
        !paymentsUnlocked ? (
          <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
              disabled
              onClick={() => showToast("Payments unlock after your lease is fully signed.")}
            >
              Payment method
            </Button>
            <Button
              type="button"
              variant="primary"
              className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
              disabled
              onClick={() => showToast("Payments unlock after your lease is fully signed.")}
            >
              Pay all
            </Button>
          </div>
        ) : unpaidPayableCharges.length > 0 ? (
          <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
            {unpaidAchCharges.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
                data-attr="resident-payments-add-payment-method"
                onClick={() => setPaymentMethodModalOpen(true)}
              >
                Payment method
              </Button>
            ) : null}
            <Button
              type="button"
              variant="primary"
              className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
              data-attr={hasPartialSelection ? "resident-payments-pay-selected" : "resident-payments-pay-all"}
              onClick={payHeaderAction}
            >
              {hasPartialSelection ? "Pay" : "Pay all"}
            </Button>
          </div>
        ) : null
      }
      filterRow={
        <>
          <TabNav activeId={tabId} items={paymentTabItems} />
          <ManagerPortalFilterRow>
            <ManagerPortalStatusPills
              tabs={[...statusTabs]}
              activeId={bucket}
              onChange={(id) => {
                setBucketTouched(true);
                setBucket(id as PaymentStatusBucket);
              }}
            />
          </ManagerPortalFilterRow>
        </>
      }
    >
      {!paymentsUnlocked ? (
        <div className="glass-card mb-4 rounded-2xl px-4 py-4 text-sm text-muted [html[data-native]_&]:hidden">
          <p className="font-medium text-foreground">Payments unlock after your lease is fully signed</p>
          <p className="mt-1">Rent, deposits, and online pay become available once you and your manager have both signed.</p>
        </div>
      ) : null}

      {!email ? (
        <p className="text-sm text-muted">Sign in to see your application fees, rent, and deposits.</p>
      ) : !paymentsUnlocked ? (
        <PortalDataTableEmpty icon="payment" message="No charges yet." />
      ) : (
        <>
          {showBulkCheckoutBar && checkout ? (
            <div className="mb-6 glass-card rounded-2xl border border-border p-4">
              {renderCheckoutBlock(
                checkout.chargeIds.length > 1
                  ? `Pay ${checkout.chargeIds.length} charges (${formatUsd(
                      checkout.chargeIds.reduce((sum, id) => {
                        const charge = charges.find((c) => c.id === id);
                        return sum + (charge ? centsFromLabel(charge.balanceLabel) : 0);
                      }, 0),
                    )})`
                  : `Pay online (${residentPaymentMethodLabel(checkout?.paymentMethod ?? paymentMethod)})`,
              )}
            </div>
          ) : null}
          {rows.length === 0 ? (
            <PortalDataTableEmpty
              icon="payment"
              message="No charges yet."
            />
          ) : rowsForBucket.length === 0 ? (
            <PortalDataTableEmpty
              icon="payment"
              message={
                bucket === "overdue"
                  ? "No overdue charges."
                  : bucket === "pending"
                    ? "No upcoming charges."
                    : "No payments in this tab yet."
              }
            />
          ) : (
            <PortalPaymentsTable
              rows={tableRows}
              expandedId={expandedId}
              onExpand={(id) => {
                setExpandedId(id);
                if (id) setCheckout(null);
              }}
              selection={
                showSelectCol
                  ? {
                      selectedIds,
                      allSelected: allBucketSelected,
                      onToggle: toggleSelected,
                      onToggleAll: toggleSelectAllBucket,
                      selectLabel: (tr) => `Select ${tr.charge}`,
                    }
                  : undefined
              }
              renderExpandedActions={renderExpandedActions}
              renderExpandedDetail={(tr) => {
                const row = chargeById.get(tr.id);
                return row ? renderRowDetail(row) : null;
              }}
            />
          )}
        </>
      )}
    </ManagerPortalPageShell>

    <Modal
      open={paymentMethodModalOpen}
      onClose={() => {
        setSetupCheckout(null);
        setPaymentMethodModalOpen(false);
      }}
      title="Payment method"
      panelClassName="max-w-lg"
    >
      {setupCheckout ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Add {setupCheckout.kind === "card" ? "a credit card" : "a bank account"} with Stripe.
          </p>
          <StripeEmbeddedCheckout clientSecret={setupCheckout.clientSecret} />
          <div className="flex justify-start">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setSetupCheckout(null)}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Saved</p>
            {savedMethodsLoading ? (
              <p className="mt-2 text-sm text-muted">Loading…</p>
            ) : savedMethods.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No saved payment methods yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {savedMethods.map((method) => (
                  <li
                    key={method.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
                  >
                    <span className="font-medium text-foreground">{method.label}</span>
                    {method.isDefault ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Default</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Add</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={setupLoading !== null}
                data-attr="resident-payments-add-bank"
                onClick={() => { void startAddPaymentMethod("ach"); }}
              >
                {setupLoading === "ach" ? "Loading…" : "Bank (ACH)"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={setupLoading !== null}
                data-attr="resident-payments-add-card"
                onClick={() => { void startAddPaymentMethod("card"); }}
              >
                {setupLoading === "card" ? "Loading…" : "Credit card"}
              </Button>
            </div>
          </div>

          {checkoutMethodOptions.length > 0 ? (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Use at checkout</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {checkoutMethodOptions.map((option) => {
                  const selected = paymentMethod === option.id;
                  const feeLabel = option.id === "zelle" || option.id === "venmo"
                    ? "No processing fee"
                    : residentProcessingFeeDisplayLabel(option.id as ResidentAxisPaymentMethod);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      data-attr={`resident-payments-checkout-method-${option.id}`}
                      onClick={() => {
                        setPaymentMethod(option.id);
                        setCheckout(null);
                      }}
                      className={`rounded-xl border px-3 py-3 text-left transition ${
                        selected
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-border bg-card hover:border-primary/30"
                      }`}
                    >
                      <p className="text-sm font-semibold text-foreground">{option.title}</p>
                      <p className="mt-1 text-xs text-muted">{feeLabel}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              variant="primary"
              className="rounded-full"
              onClick={() => setPaymentMethodModalOpen(false)}
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>

    <Modal
      open={payConfirm !== null}
      onClose={() => {
        if (reportingManualPayment) return;
        setPayConfirm(null);
        setManualSentConfirmed(false);
      }}
      title={
        payConfirm && isStripeResidentPayMethod(payConfirm.method)
          ? "Continue to Stripe?"
          : "Confirm payment sent"
      }
      panelClassName="max-w-lg"
    >
      {payConfirm ? (
        <div className="space-y-4">
          {isStripeResidentPayMethod(payConfirm.method) ? (
            <>
              <p className="text-sm leading-relaxed text-muted">
                You&apos;ll complete payment securely with Stripe using{" "}
                <span className="font-semibold text-foreground">
                  {residentPaymentMethodLabel(payConfirm.method)}
                </span>
                .
              </p>
              <p className="text-sm text-foreground">
                {confirmCharges.length === 1 ? "Amount" : `${confirmCharges.length} charges`}:{" "}
                <span className="font-semibold tabular-nums">{confirmTotalLabel}</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-muted">
                Please send <span className="font-semibold text-foreground">{confirmTotalLabel}</span> via{" "}
                {residentManualPaymentMethodLabel(payConfirm.method)}. Your manager will verify the payment and mark
                {confirmCharges.length === 1 ? " this charge" : " these charges"} paid when they receive it. The charge
                {confirmCharges.length === 1 ? " stays" : "s stay"} pending until then.
              </p>
              {manualContactForCharges(confirmCharges, payConfirm.method) ? (
                <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Send to</p>
                  <p className="mt-1 font-mono font-semibold text-foreground">
                    {manualContactForCharges(confirmCharges, payConfirm.method)}
                  </p>
                </div>
              ) : null}
              <label className="flex cursor-pointer gap-3 rounded-2xl border border-border bg-card p-4">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 rounded border-border"
                  checked={manualSentConfirmed}
                  onChange={(e) => setManualSentConfirmed(e.target.checked)}
                />
                <span className="text-sm leading-relaxed text-foreground">
                  I confirm I already sent payment via {residentManualPaymentMethodLabel(payConfirm.method)}.
                </span>
              </label>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={reportingManualPayment}
              onClick={() => {
                setPayConfirm(null);
                setManualSentConfirmed(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              className="rounded-full"
              disabled={reportingManualPayment || (!isStripeResidentPayMethod(payConfirm.method) && !manualSentConfirmed)}
              data-attr={
                isStripeResidentPayMethod(payConfirm.method)
                  ? "resident-payments-confirm-stripe"
                  : "resident-payments-confirm-manual"
              }
              onClick={() => {
                if (isStripeResidentPayMethod(payConfirm.method)) {
                  void confirmStripePayment();
                } else {
                  void confirmManualPayment();
                }
              }}
            >
              {reportingManualPayment
                ? "Saving…"
                : isStripeResidentPayMethod(payConfirm.method)
                  ? "Continue to Stripe"
                  : "I sent payment"}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
    </>
  );
}
