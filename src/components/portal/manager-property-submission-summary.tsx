"use client";

import {
  LISTING_PLACE_CATEGORY_OPTIONS,
  LISTING_PROPERTY_TYPE_OPTIONS,
} from "@/data/manager-listing-presets";
import {
  entireHomeMonthlyRentAmount,
  isEntireHomeListing,
  PAYMENT_AT_SIGNING_OPTIONS,
  type ManagerListingSubmissionV1,
  type PaymentAtSigningOptionId,
} from "@/lib/manager-listing-submission";

function presetLabel(options: readonly { id: string; label: string }[], id?: string): string | null {
  if (!id?.trim()) return null;
  return options.find((o) => o.id === id)?.label ?? null;
}

function InfoBlock({ label, value }: { label: string; value: string | null | undefined }) {
  const text = value?.trim();
  if (!text) return null;
  return (
    <div className="rounded-xl border border-border bg-accent/20 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</p>
    </div>
  );
}

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
  listingId,
}: {
  sub: ManagerListingSubmissionV1;
  listingId?: string | null;
}) {
  const entireHome = isEntireHomeListing(sub);
  const propertyType = presetLabel(LISTING_PROPERTY_TYPE_OPTIONS, sub.listingPropertyTypeId);
  const placeCategory = presetLabel(LISTING_PLACE_CATEGORY_OPTIONS, sub.listingPlaceCategoryId);
  const rooms = sub.rooms.filter((r) => r.name.trim());
  const rentDue =
    sub.rentDueDayMode === "last_of_month" ? "Last day of month" : "1st of month";
  const paymentPaths = [
    sub.axisPaymentsEnabled !== false ? "Axis ACH" : null,
    sub.zellePaymentsEnabled && sub.zelleContact?.trim() ? `Zelle (${sub.zelleContact.trim()})` : null,
    sub.venmoPaymentsEnabled && sub.venmoContact?.trim() ? `Venmo (${sub.venmoContact.trim()})` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Manager details</p>
        {listingId?.trim() ? (
          <span className="text-[11px] font-medium text-muted">Listing ID · {listingId.trim()}</span>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {propertyType ? (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Property type</p>
            <p className="mt-0.5 text-sm text-foreground">{propertyType}</p>
          </div>
        ) : null}
        {placeCategory ? (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Listing type</p>
            <p className="mt-0.5 text-sm text-foreground">{placeCategory}</p>
          </div>
        ) : null}
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

      {rooms.length > 0 ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
            {entireHome ? "Bedrooms" : "Rooms & rent"}
          </p>
          <ul className="mt-2 space-y-2">
            {rooms.map((room) => (
              <li
                key={room.id}
                className="rounded-xl border border-border bg-card px-4 py-3 text-sm [html[data-theme=dark]_&]:portal-surface-muted"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-foreground">{room.name.trim()}</p>
                  {!entireHome && room.monthlyRent > 0 ? (
                    <p className="text-sm font-medium text-foreground">${room.monthlyRent.toLocaleString()}/mo</p>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {[
                    room.floor.trim() ? `Floor ${room.floor.trim()}` : null,
                    room.utilitiesEstimate.trim() ? `Utilities ~${room.utilitiesEstimate.trim()}` : null,
                    room.moveInAvailableDate.trim() ? `Available ${room.moveInAvailableDate.trim()}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {room.moveInInstructions.trim() ? (
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted">{room.moveInInstructions.trim()}</p>
                ) : null}
              </li>
            ))}
          </ul>
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

      {sub.houseCostsDetail.trim() ? (
        <InfoBlock label="Other monthly costs" value={sub.houseCostsDetail} />
      ) : null}
    </div>
  );
}
