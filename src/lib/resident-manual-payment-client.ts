import { isDemoModeActive } from "@/lib/demo/demo-session";
import {
  applyHouseholdChargeServerUpdates,
  type HouseholdCharge,
} from "@/lib/household-charges";

/** Poll while a resident is waiting on Zelle/Venmo confirmation. */
export const RESIDENT_MANUAL_PAYMENT_AUTO_CHECK_MS = 30_000;

/** Manager Gmail sync while unpaid manual charges may exist. */
export const MANAGER_MANUAL_PAYMENT_AUTO_CHECK_MS = 60_000;

export type ResidentManualPaymentChannel = "zelle" | "venmo";

export async function checkResidentManualPayment(
  chargeIds: string[],
  channel: ResidentManualPaymentChannel,
): Promise<
  | { ok: true; paid: true; charges: HouseholdCharge[] }
  | { ok: true; paid: false; message: string }
  | { ok: false; error: string }
> {
  if (!isBrowser()) {
    return { ok: false, error: "Payment check is only available in the browser." };
  }
  if (isDemoModeActive()) {
    return { ok: false, error: "Payment check is unavailable in demo mode." };
  }
  const ids = [...new Set(chargeIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return { ok: false, error: "No charges selected." };

  const res = await fetch("/api/portal/resident-check-manual-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ chargeIds: ids, channel }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    paid?: boolean;
    message?: string;
    error?: string;
    charges?: HouseholdCharge[];
  };
  if (!res.ok) {
    return { ok: false, error: typeof payload.error === "string" ? payload.error : "Could not check payment." };
  }
  if (!payload.paid) {
    return {
      ok: true,
      paid: false,
      message:
        typeof payload.message === "string"
          ? payload.message
          : "We haven't received this payment yet. Send the amount, wait a moment, then check again.",
    };
  }

  const updates = Array.isArray(payload.charges) ? payload.charges : [];
  if (updates.length > 0 && isBrowser()) {
    applyHouseholdChargeServerUpdates(updates);
  }
  return { ok: true, paid: true, charges: updates };
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}
