"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
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
    <Modal open={open} title={title} onClose={onClose} panelClassName="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
      <div className="mb-5 flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm">
        <span className="text-slate-500">Current move-out date</span>
        <span className="ml-auto font-semibold text-slate-900">{currentEndFormatted}</span>
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">New move-out date</label>
        <input
          type="date"
          value={selectedDate}
          min={leaseStart || undefined}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {selectedDate && selectedDate !== currentEnd ? (
        <div className="mb-5 space-y-2">
          {direction === "decrease" ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Moving out earlier may result in an early termination fee. Confirm any charges with your property manager.
            </div>
          ) : null}
          {direction === "extend" && availability.status === "checking" ? (
            <p className="text-sm text-slate-500">Checking room availability…</p>
          ) : null}
          {direction === "extend" && availability.status === "available" ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Room is available through the new date.
            </p>
          ) : null}
          {direction === "extend" && availability.status === "unavailable" ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{availability.reason}</p>
          ) : null}
          {availability.status === "error" ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{availability.message}</p>
          ) : null}
          <p className="px-1 text-xs text-slate-500">
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
