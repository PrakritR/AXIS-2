"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { ApplicationBackgroundCheck } from "@/lib/checkr/types";
import { applicationShowsBackgroundCheck } from "@/lib/application-background-check";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { buildBackgroundCheckReportHtml } from "@/lib/background-check-report-html";
import type { ManagerScreeningSettings } from "@/lib/screening/types";

/**
 * Inline rendered-document view of the applicant's credit/background
 * screening, matching the application document presentation (clean styled
 * HTML in an srcDoc iframe). Renders nothing when there is no screening or
 * background check to show yet.
 */
function BackgroundCheckReportPreview({ row }: { row: DemoApplicantRow }) {
  const reportHtml = useMemo(() => buildBackgroundCheckReportHtml(row), [row]);
  if (!reportHtml) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-border shadow-sm">
      <iframe
        srcDoc={reportHtml}
        title="Background check report preview"
        sandbox="allow-same-origin"
        loading="lazy"
        className="h-[560px] w-full border-0 bg-white"
      />
    </div>
  );
}

export function backgroundCheckChip(bc: ApplicationBackgroundCheck): { label: string; className: string } {
  const ring = "ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  if (bc.status !== "complete") {
    return { label: "Checkr: Pending", className: `portal-badge-info ${ring}` };
  }
  if (bc.result === "clear") {
    return { label: "Checkr: Clear", className: `portal-badge-success ${ring}` };
  }
  if (bc.result === "consider") {
    return { label: "Checkr: Consider", className: `portal-badge-pending ${ring}` };
  }
  const label = bc.status.charAt(0).toUpperCase() + bc.status.slice(1);
  return { label: `Checkr: ${label}`, className: `portal-badge-pending ${ring}` };
}

export function ApplicationScreeningPanel({
  row,
  onUpdated,
  onOpenScreeningModal,
}: {
  row: DemoApplicantRow;
  onUpdated?: () => void;
  /** Opens the cost-confirmation modal (billed to the manager) to start/re-run the Checkr check. */
  onOpenScreeningModal?: () => void;
}) {
  const { showToast } = useAppUi();
  const [settings, setSettings] = useState<ManagerScreeningSettings | null>(null);
  const [configured, setConfigured] = useState(false);
  const [costCents, setCostCents] = useState(3999);
  const [busy, setBusy] = useState(false);
  const [bgConfigured, setBgConfigured] = useState(false);
  // Optimistic override from run/poll responses; falls back to the synced row.
  const [bgOverride, setBgOverride] = useState<ApplicationBackgroundCheck | undefined>();
  const [bgBusy, setBgBusy] = useState(false);
  const bg = bgOverride ?? row.backgroundCheck;

  useEffect(() => {
    void fetch("/api/screening/settings", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as {
          settings?: ManagerScreeningSettings;
          configured?: boolean;
          costCents?: number;
          backgroundCheckConfigured?: boolean;
        };
        if (body.settings) setSettings(body.settings);
        setConfigured(Boolean(body.configured));
        setBgConfigured(Boolean(body.backgroundCheckConfigured));
        if (typeof body.costCents === "number") setCostCents(body.costCents);
      })
      .catch(() => undefined);
  }, []);

  const callBackgroundCheck = useCallback(
    async (action: "refresh") => {
      setBgBusy(true);
      try {
        const res = await fetch("/api/screening/background-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ applicationId: row.id, action }),
        });
        const body = (await res.json()) as { error?: string; backgroundCheck?: ApplicationBackgroundCheck };
        if (!res.ok) return;
        if (body.backgroundCheck) setBgOverride(body.backgroundCheck);
        if (body.backgroundCheck?.status === "complete") onUpdated?.();
      } finally {
        setBgBusy(false);
      }
    },
    [onUpdated, row.id],
  );

  // Poll Checkr while a report is pending so the status resolves without a reload.
  // Starting/re-running is billed, so it only happens via the confirmation modal.
  useEffect(() => {
    if (bg?.status !== "pending") return;
    let cancelled = false;
    const timer = setInterval(() => {
      if (cancelled) return;
      void callBackgroundCheck("refresh");
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [bg?.status, bg?.reportId, callBackgroundCheck]);

  const runScreening = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/screening/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ applicationId: row.id }),
      });
      const body = (await res.json()) as { error?: string; code?: string };
      if (!res.ok) {
        showToast(body.error ?? "Could not order screening.");
        return;
      }
      showToast("Screening ordered. Results will appear when the report completes.");
      onUpdated?.();
    } catch {
      showToast("Network error ordering screening.");
    } finally {
      setBusy(false);
    }
  }, [onUpdated, row.id, showToast]);

  if (!applicationShowsBackgroundCheck(row)) return null;

  const screening = row.screening;
  const canOrder =
    configured &&
    settings?.mode !== "off" &&
    row.application?.consentCredit &&
    screening?.status !== "in_progress" &&
    screening?.status !== "queued" &&
    screening?.status !== "complete";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Screening</p>

      <BackgroundCheckReportPreview row={row} />

      {screening?.adverseActionRequired ? (
        <p className="mt-4 rounded-xl border px-3 py-2 text-xs portal-banner-pending">
          Adverse action may be required before denying based on this consumer report (FCRA).
        </p>
      ) : null}

      {bg?.result === "consider" ? (
        <p className="mt-4 rounded-xl border px-3 py-2 text-xs portal-banner-pending">
          Checkr flagged records to review. Consult the full Checkr report and applicable fair-chance rules before
          any adverse action (FCRA).
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {canOrder ? (
          <Button type="button" className="rounded-full px-5" disabled={busy} onClick={() => void runScreening()}>
            {busy ? "Ordering…" : screening?.status === "failed" ? "Re-run screening" : "Run screening"}
          </Button>
        ) : null}
        {bgConfigured && row.application?.consentCredit && bg?.status !== "pending" && onOpenScreeningModal ? (
          <Button
            type="button"
            data-attr="run-background-check"
            className="rounded-full px-5"
            onClick={onOpenScreeningModal}
          >
            {bg ? "Re-run background check" : "Run background check"}
          </Button>
        ) : null}
        {bg?.status === "pending" ? (
          <>
            <span className="text-xs text-muted">Checkr is processing — status updates automatically.</span>
            <button
              type="button"
              className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
              disabled={bgBusy}
              onClick={() => void callBackgroundCheck("refresh")}
            >
              Refresh now
            </button>
          </>
        ) : null}
        {screening?.reportUrl ? (
          <Link
            href={screening.reportUrl.startsWith("http") ? screening.reportUrl : `https://${screening.reportUrl.replace(/^\/+/, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-primary hover:underline"
          >
            View full vendor report
          </Link>
        ) : null}
        {configured && settings?.mode === "off" ? (
          <p className="text-xs text-muted">Screening is off in Applications settings.</p>
        ) : settings?.mode === "auto_on_submit" ? (
          <p className="text-xs text-muted">Auto on submit — ${(costCents / 100).toFixed(2)} / report.</p>
        ) : (
          <p className="text-xs text-muted">${(costCents / 100).toFixed(2)} / report.</p>
        )}
        {!bgConfigured ? (
          <p className="text-xs text-muted">Add CHECKR_API_KEY to enable background checks.</p>
        ) : !row.application?.consentCredit ? (
          <p className="text-xs text-muted">Applicant must authorize a background check first.</p>
        ) : null}
      </div>
    </div>
  );
}
