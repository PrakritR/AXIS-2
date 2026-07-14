"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { computeLeaseEndDate, shouldAutoComputeLeaseEnd } from "@/lib/rental-application/lease-dates";
import { LEASE_TERM_OPTIONS } from "@/lib/rental-application/lease-terms";
import { formatPacificDate } from "@/lib/pacific-time";

type AvailabilityResult =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; direction: "extend" | "decrease" | "same" }
  | { status: "unavailable"; direction: "extend"; reason: string; nextAvailableDate?: string | null }
  | { status: "error"; message: string };

export function LeaseAmendMoveOutModal({
  open,
  onClose,
  currentEnd,
  leaseStart,
  title = "Renew or extend lease",
  checkUrl,
  amendUrl,
  amendBody,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  currentEnd: string;
  leaseStart: string;
  title?: string;
  checkUrl: string;
  amendUrl: string;
  amendBody?: Record<string, string>;
  onSuccess: () => void;
}) {
  const { showToast } = useAppUi();
  const [selectedDate, setSelectedDate] = useState("");
  const [availability, setAvailability] = useState<AvailabilityResult>({ status: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setSelectedDate("");
        setAvailability({ status: "idle" });
        setSubmitting(false);
      });
    }
  }, [open]);

  const direction = selectedDate
    ? selectedDate < currentEnd
      ? "decrease"
      : selectedDate > currentEnd
        ? "extend"
        : "same"
    : null;

  useEffect(() => {
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    if (!selectedDate || selectedDate === currentEnd) {
      queueMicrotask(() => setAvailability({ status: "idle" }));
      return;
    }
    if (direction === "decrease") {
      queueMicrotask(() => setAvailability({ status: "available", direction: "decrease" }));
      return;
    }
    queueMicrotask(() => setAvailability({ status: "checking" }));
    checkTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(checkUrl, {
            method: checkUrl.includes("/manager/") ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newLeaseEnd: selectedDate, ...amendBody }),
          });
          const json = (await res.json()) as {
            available?: boolean;
            direction?: string;
            reason?: string;
            nextAvailableDate?: string | null;
            error?: string;
          };
          if (!res.ok || json.error) {
            setAvailability({ status: "error", message: json.error ?? "Could not check availability." });
            return;
          }
          if (json.available) {
            setAvailability({ status: "available", direction: "extend" });
          } else {
            setAvailability({
              status: "unavailable",
              direction: "extend",
              reason: json.reason ?? "This room is not available for the selected period.",
              nextAvailableDate: json.nextAvailableDate ?? null,
            });
          }
        } catch {
          setAvailability({ status: "error", message: "Network error — please try again." });
        }
      })();
    }, 600);
    return () => {
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    };
  }, [selectedDate, currentEnd, direction, checkUrl, amendBody]);

  const canConfirm =
    Boolean(selectedDate) &&
    selectedDate !== currentEnd &&
    !submitting &&
    availability.status !== "checking" &&
    availability.status !== "unavailable";

  const handleConfirm = async () => {
    if (!selectedDate || !canConfirm) return;
    setSubmitting(true);
    try {
      const res = await fetch(amendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newLeaseEnd: selectedDate, ...amendBody }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; direction?: string };
      if (!res.ok || !json.ok) {
        showToast(json.error ?? "Failed to update move-out date.");
      } else {
        onClose();
        onSuccess();
        const msg =
          json.direction === "decrease"
            ? "Move-out date updated. The lease needs to be re-signed."
            : "Lease extended. The lease needs to be re-signed.";
        showToast(msg);
      }
    } catch {
      showToast("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const currentEndFormatted = currentEnd
    ? formatPacificDate(currentEnd, { year: "numeric", month: "long", day: "numeric" })
    : "—";

  return (
    <Modal open={open} title={title} onClose={onClose} panelClassName="modal-panel relative w-full max-w-md overflow-hidden rounded-2xl border border-border p-5 shadow-2xl sm:p-6">
      <div className="mb-5 flex items-center gap-3 rounded-xl bg-accent/30 px-4 py-3 text-sm">
        <span className="text-muted">Current move-out date</span>
        <span className="ml-auto font-semibold text-foreground">{currentEndFormatted}</span>
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-semibold text-muted">New move-out date</label>
        <input
          type="date"
          value={selectedDate}
          min={leaseStart || undefined}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full rounded-xl border border-border px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {selectedDate && selectedDate !== currentEnd ? (
        <div className="mb-5 space-y-2">
          {direction === "decrease" ? (
            <div className="rounded-xl border px-4 py-3 text-sm portal-banner-pending">
              Moving out earlier may result in an early termination fee. Confirm any charges with your property manager.
            </div>
          ) : null}
          {direction === "extend" && availability.status === "checking" ? (
            <p className="text-sm text-muted">Checking room availability…</p>
          ) : null}
          {direction === "extend" && availability.status === "available" ? (
            <p className="rounded-xl border px-4 py-3 text-sm portal-banner-success">
              Room is available through the new date.
            </p>
          ) : null}
          {direction === "extend" && availability.status === "unavailable" ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{availability.reason}</p>
          ) : null}
          {availability.status === "error" ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{availability.message}</p>
          ) : null}
          <p className="px-1 text-xs text-muted">
            Updating the move-out date resets the lease for re-signing by the resident and property manager.
          </p>
        </div>
      ) : null}

      <div className="flex gap-2.5">
        <Button type="button" variant="outline" className="flex-1 rounded-full" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="primary" className="flex-1 rounded-full" disabled={!canConfirm} onClick={() => void handleConfirm()}>
          {submitting ? "Saving…" : direction === "decrease" ? "Update move-out" : "Extend lease"}
        </Button>
      </div>
    </Modal>
  );
}

/** Day after an ISO date (renewals default to starting when the current lease ends). */
function dayAfter(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Full lease renewal: new term (fixed length or Month-to-Month), start date,
 * and monthly rent. Submits mode:"renew" to /api/manager/amend-lease; the
 * lease re-enters the pipeline for both signatures, and payments update to
 * the new terms only once it is fully signed.
 */
export function LeaseRenewModal({
  open,
  onClose,
  currentEnd,
  currentTerm,
  currentRentLabel,
  leaseId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  currentEnd: string;
  currentTerm: string;
  currentRentLabel: string;
  leaseId: string;
  onSuccess: () => void;
}) {
  const { showToast } = useAppUi();
  const defaultStart = currentEnd ? dayAfter(currentEnd) : new Date().toISOString().slice(0, 10);
  const [leaseTerm, setLeaseTerm] = useState(currentTerm || "12-Month");
  const [leaseStart, setLeaseStart] = useState(defaultStart);
  const [customEnd, setCustomEnd] = useState("");
  const [rent, setRent] = useState(() => currentRentLabel.replace(/[^\d.]/g, ""));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setLeaseTerm(currentTerm || "12-Month");
        setLeaseStart(defaultStart);
        setCustomEnd("");
        setRent(currentRentLabel.replace(/[^\d.]/g, ""));
        setSubmitting(false);
      });
    }
  }, [open, currentTerm, defaultStart, currentRentLabel]);

  const isMonthToMonth = leaseTerm === "Month-to-Month";
  const isCustom = leaseTerm === "Custom";
  const leaseEnd = useMemo(() => {
    if (isMonthToMonth) return "";
    if (isCustom) return customEnd;
    return shouldAutoComputeLeaseEnd(leaseTerm) ? computeLeaseEndDate(leaseStart, leaseTerm) : customEnd;
  }, [leaseTerm, leaseStart, customEnd, isMonthToMonth, isCustom]);

  const rentAmount = rent.trim() ? Number(rent.replace(/[^\d.]/g, "")) : null;
  const canConfirm =
    !submitting &&
    Boolean(leaseTerm) &&
    Boolean(leaseStart) &&
    (isMonthToMonth || Boolean(leaseEnd)) &&
    (!leaseEnd || leaseEnd >= leaseStart) &&
    (rentAmount == null || (Number.isFinite(rentAmount) && rentAmount > 0));

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/manager/amend-lease", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaseId,
          mode: "renew",
          leaseTerm,
          leaseStart,
          leaseEnd,
          monthlyRent: rentAmount,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        showToast(json.error ?? "Could not create the renewal.");
      } else {
        onClose();
        onSuccess();
        showToast("Renewal created — the lease needs to be signed by both parties. Payments update once it's fully signed.");
      }
    } catch {
      showToast("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const currentEndFormatted = currentEnd
    ? formatPacificDate(currentEnd, { year: "numeric", month: "long", day: "numeric" })
    : "No end date (month-to-month)";

  return (
    <Modal
      open={open}
      title="Renew lease"
      onClose={onClose}
      panelClassName="modal-panel relative w-full max-w-md overflow-hidden rounded-2xl border border-border p-5 shadow-2xl sm:p-6"
    >
      <div className="mb-5 flex items-center gap-3 rounded-xl bg-accent/30 px-4 py-3 text-sm">
        <span className="text-muted">Current lease ends</span>
        <span className="ml-auto font-semibold text-foreground">{currentEndFormatted}</span>
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-semibold text-muted">New lease term</label>
        <Select value={leaseTerm} onChange={(e) => setLeaseTerm(e.target.value)} data-attr="lease-renew-term">
          {LEASE_TERM_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        {isMonthToMonth ? (
          <p className="mt-1.5 text-xs text-muted">
            Month-to-month continues automatically each month — no end date. Either party can end it with proper notice.
          </p>
        ) : null}
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-muted">Renewal starts</label>
          <input
            type="date"
            value={leaseStart}
            onChange={(e) => setLeaseStart(e.target.value)}
            className="w-full rounded-xl border border-border px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-muted">Ends</label>
          {isMonthToMonth ? (
            <div className="rounded-xl border border-border bg-accent/30 px-3 py-2.5 text-sm text-muted">Open-ended</div>
          ) : isCustom || !shouldAutoComputeLeaseEnd(leaseTerm) ? (
            <input
              type="date"
              value={customEnd}
              min={leaseStart || undefined}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          ) : (
            <div className="rounded-xl border border-border bg-accent/30 px-3 py-2.5 text-sm text-foreground">
              {leaseEnd || "—"}
            </div>
          )}
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-semibold text-muted">Monthly rent</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
          <Input
            value={rent}
            inputMode="decimal"
            onChange={(e) => setRent(e.target.value)}
            className="pl-7"
            placeholder="e.g. 1450"
            data-attr="lease-renew-rent"
          />
        </div>
        <p className="mt-1.5 text-xs text-muted">
          Leave unchanged to keep the current rent{currentRentLabel ? ` (${currentRentLabel})` : ""}.
        </p>
      </div>

      <p className="mb-5 rounded-xl border px-4 py-3 text-xs portal-banner-info">
        The renewed lease is regenerated with these terms and goes back through resident + manager signatures.
        Rent charges and the payment schedule update automatically once both parties have signed.
      </p>

      <div className="flex gap-2.5">
        <Button type="button" variant="outline" className="flex-1 rounded-full" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          className="flex-1 rounded-full"
          disabled={!canConfirm}
          onClick={() => void handleConfirm()}
          data-attr="lease-renew-confirm"
        >
          {submitting ? "Creating…" : "Create renewal"}
        </Button>
      </div>
    </Modal>
  );
}
