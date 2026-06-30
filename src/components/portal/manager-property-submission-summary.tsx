"use client";

import {
  entireHomeMonthlyRentAmount,
  isEntireHomeListing,
  PAYMENT_AT_SIGNING_OPTIONS,
  type ManagerListingSubmissionV1,
  type PaymentAtSigningOptionId,
} from "@/lib/manager-listing-submission";

function fmtMoney(raw: string | number | null | undefined): string | null {
  if (raw == null) return null;
  if (typeof raw === "number") return raw > 0 ? `$${raw.toLocaleString()}` : raw === 0 ? "$0" : null;
  const t = String(raw).trim();
  if (!t) return null;
  if (t.startsWith("$")) return t;
  return `$${t}`;
}

function signingLabels(ids: PaymentAtSigningOptionId[] | undefined): string | null {
  const selected = (ids ?? [])
    .map((id) => PAYMENT_AT_SIGNING_OPTIONS.find((o) => o.id === id)?.label)
    .filter(Boolean);
  return selected.length ? selected.join(", ") : null;
}

export function ManagerPropertySubmissionSummary({
  sub,
}: {
  sub: ManagerListingSubmissionV1;
  listingId?: string | null;
}) {
  const entireHome = isEntireHomeListing(sub);
  const rentDue =
    sub.rentDueDayMode === "last_of_month" ? "Last day of month" : "1st of month";
  const paymentPaths = [
    sub.axisPaymentsEnabled !== false ? "Axis ACH" : null,
    sub.zellePaymentsEnabled && sub.zelleContact?.trim() ? `Zelle (${sub.zelleContact.trim()})` : null,
    sub.venmoPaymentsEnabled && sub.venmoContact?.trim() ? `Venmo (${sub.venmoContact.trim()})` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Pets</p>
          <p className="mt-0.5 text-sm text-foreground">{sub.petFriendly ? "Pet friendly" : "No pets"}</p>
        </div>
        {entireHome ? (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Entire-home rent</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {fmtMoney(entireHomeMonthlyRentAmount(sub)) ?? "—"}/mo
            </p>
          </div>
        ) : null}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Rent due</p>
          <p className="mt-0.5 text-sm text-foreground">{rentDue}</p>
        </div>
        {sub.lateFeeEnabled !== false ? (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Late fee</p>
            <p className="mt-0.5 text-sm text-foreground">
              {fmtMoney(sub.lateFeeAmount ?? "50") ?? "$50"} after {sub.lateFeeGraceDays ?? 5} days
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Application fee</p>
          <p className="mt-0.5 text-sm text-foreground">{fmtMoney(sub.applicationFee) ?? "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Security deposit</p>
          <p className="mt-0.5 text-sm text-foreground">{fmtMoney(sub.securityDeposit) ?? "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Move-in fee</p>
          <p className="mt-0.5 text-sm text-foreground">{fmtMoney(sub.moveInFee) ?? "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Due at signing</p>
          <p className="mt-0.5 text-sm text-foreground">{signingLabels(sub.paymentAtSigningIncludes) ?? "—"}</p>
        </div>
      </div>

      {paymentPaths.length > 0 ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Payment methods</p>
          <p className="mt-0.5 text-sm text-foreground">{paymentPaths.join(" · ")}</p>
        </div>
      ) : null}

      {entireHome && (sub.houseMoveInAvailableDate?.trim() || sub.houseMoveInInstructions?.trim()) ? (
        <div className="rounded-xl border border-border bg-card px-4 py-3 [html[data-theme=dark]_&]:portal-surface-muted">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Entire-home move-in</p>
          {sub.houseMoveInAvailableDate?.trim() ? (
            <p className="mt-1 text-sm text-foreground">Available {sub.houseMoveInAvailableDate.trim()}</p>
          ) : null}
          {sub.houseMoveInInstructions?.trim() ? (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{sub.houseMoveInInstructions.trim()}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
