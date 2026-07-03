"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { track } from "@/lib/analytics/track-client";
import { backgroundCheckChip } from "@/components/portal/application-screening-panel";
import type { ApplicationBackgroundCheck } from "@/lib/checkr/types";
import type { DemoApplicantRow } from "@/data/demo-portal";

/**
 * Confirms cost + manager-pays billing, then starts (or re-runs) a real Checkr
 * screening and shows live status until it resolves to Clear/Consider.
 */
export function CheckrScreeningModal({
  row,
  open,
  onClose,
  onUpdated,
}: {
  row: DemoApplicantRow | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const { showToast } = useAppUi();
  const [costCents, setCostCents] = useState(2999);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lazy init from the row prop — the parent remounts this component (via a
  // `key`) each time it opens for a (possibly different) applicant, so this
  // only ever runs once per open.
  const [bg, setBg] = useState<ApplicationBackgroundCheck | undefined>(() => row?.backgroundCheck);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/screening/settings", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as {
          backgroundCheckConfigured?: boolean;
          checkrCostCents?: number;
        };
        setConfigured(Boolean(body.backgroundCheckConfigured));
        if (typeof body.checkrCostCents === "number") setCostCents(body.checkrCostCents);
      })
      .catch(() => undefined);
  }, [open, row]);

  // Poll while pending so the modal (and the applicant's row) resolve without a reload.
  useEffect(() => {
    if (!open || !row || bg?.status !== "pending") return;
    let cancelled = false;
    const timer = setInterval(() => {
      void fetch("/api/screening/background-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ applicationId: row.id, action: "refresh" }),
      })
        .then(async (res) => {
          if (cancelled || !res.ok) return;
          const body = (await res.json()) as { backgroundCheck?: ApplicationBackgroundCheck };
          if (!body.backgroundCheck) return;
          setBg(body.backgroundCheck);
          if (body.backgroundCheck.status === "complete") onUpdated?.();
        })
        .catch(() => undefined);
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open, row, bg?.status, onUpdated]);

  const confirm = useCallback(async () => {
    if (!row) return;
    setBusy(true);
    setError(null);
    track("background_check_started", { provider: "checkr" });
    try {
      const res = await fetch("/api/screening/background-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ applicationId: row.id, action: "run" }),
      });
      const body = (await res.json()) as {
        error?: string;
        code?: string;
        backgroundCheck?: ApplicationBackgroundCheck;
      };
      if (!res.ok) {
        setError(body.error ?? "Could not start screening.");
        return;
      }
      if (body.backgroundCheck) setBg(body.backgroundCheck);
      showToast("Screening started — billed to your account. Results appear when Checkr completes.");
      onUpdated?.();
    } catch {
      setError("Network error starting screening.");
    } finally {
      setBusy(false);
    }
  }, [row, onUpdated, showToast]);

  if (!row) return null;

  const canRun = configured && Boolean(row.application?.consentCredit) && bg?.status !== "pending";
  const chip = bg ? backgroundCheckChip(bg) : null;

  return (
    <Modal open={open} onClose={onClose} title={`Run screening — ${row.name}`}>
      <div className="space-y-4 text-sm">
        {!configured ? (
          <p className="text-muted">Background checks are not configured. Add CHECKR_API_KEY to enable this.</p>
        ) : !row.application?.consentCredit ? (
          <p className="text-muted">This applicant has not authorized a background check.</p>
        ) : (
          <>
            <p className="leading-relaxed text-foreground">
              Runs a criminal, credit, and eviction background check through Checkr for{" "}
              <span className="font-semibold">{row.name}</span>. Results come back as{" "}
              <span className="font-semibold">Clear</span> or <span className="font-semibold">Consider</span> —
              consider results need a manual look before any adverse action (FCRA).
            </p>
            <div className="rounded-xl border border-border bg-foreground/5 p-3">
              <p className="font-semibold text-foreground">${(costCents / 100).toFixed(2)} per run</p>
              <p className="mt-1 text-xs text-muted">
                Billed to your saved payment method on the Plan page — not charged to the applicant.
              </p>
            </div>
          </>
        )}

        {error ? <p className="rounded-xl border px-3 py-2 text-xs portal-banner-pending">{error}</p> : null}

        {bg ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${chip!.className}`}>
              {chip!.label}
            </span>
            {bg.status === "pending" ? (
              <span className="text-xs text-muted">Checkr is processing — this updates automatically.</span>
            ) : null}
          </div>
        ) : null}

        {bg?.result === "consider" ? (
          <p className="rounded-xl border px-3 py-2 text-xs portal-banner-pending">
            Checkr flagged records to review. Consult the full report and applicable fair-chance rules before any
            adverse action (FCRA).
          </p>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          {configured && row.application?.consentCredit ? (
            <Button
              type="button"
              data-attr="run-screening-checkr"
              disabled={busy || !canRun}
              onClick={() => void confirm()}
            >
              {busy ? "Starting…" : bg ? "Re-run screening" : "Confirm & run screening"}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
