"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/track-client";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { ApplicationBackgroundCheck } from "@/lib/checkr/types";
import {
  applicationShowsBackgroundCheck,
  backgroundCheckStatusClassName,
  backgroundCheckStatusLabel,
  resolveBackgroundCheckStatus,
} from "@/lib/application-background-check";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { recommendationLabel } from "@/lib/screening/recommendation";
import type { ManagerScreeningSettings, ScreeningRecommendation } from "@/lib/screening/types";

function recommendationClass(recommendation: ScreeningRecommendation): string {
  switch (recommendation) {
    case "strong_yes":
      return "portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
    case "concerns":
      return "portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
    case "not_available":
      return "portal-badge-info ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
    case "review":
    default:
      return "bg-foreground/5 text-muted ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  }
}

function backgroundCheckChip(bc: ApplicationBackgroundCheck): { label: string; className: string } {
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
}: {
  row: DemoApplicantRow;
  onUpdated?: () => void;
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
    async (action: "run" | "refresh") => {
      setBgBusy(true);
      try {
        const res = await fetch("/api/screening/background-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ applicationId: row.id, action }),
        });
        const body = (await res.json()) as { error?: string; backgroundCheck?: ApplicationBackgroundCheck };
        if (!res.ok) {
          if (action === "run") showToast(body.error ?? "Could not run background check.");
          return;
        }
        if (body.backgroundCheck) setBgOverride(body.backgroundCheck);
        if (action === "run") {
          showToast("Background check requested. Results appear when Checkr completes.");
          onUpdated?.();
        } else if (body.backgroundCheck?.status === "complete") {
          onUpdated?.();
        }
      } catch {
        if (action === "run") showToast("Network error running background check.");
      } finally {
        setBgBusy(false);
      }
    },
    [onUpdated, row.id, showToast],
  );

  const runBackgroundCheck = useCallback(() => {
    track("background_check_started", { provider: "checkr" });
    void callBackgroundCheck("run");
  }, [callBackgroundCheck]);

  // Poll Checkr while a report is pending so the status resolves without a reload.
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

  const legacyStatus = resolveBackgroundCheckStatus(row);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Screening</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Outsourced credit and background check with a plain-language summary — no need to dig through bureau PDFs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${backgroundCheckStatusClassName(legacyStatus)}`}
          >
            {backgroundCheckStatusLabel(legacyStatus)}
          </span>
          {screening?.recommendation ? (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${recommendationClass(screening.recommendation)}`}
            >
              {recommendationLabel(screening.recommendation)}
            </span>
          ) : null}
        </div>
      </div>

      {screening?.summary ? <p className="mt-4 text-sm leading-relaxed text-foreground">{screening.summary}</p> : null}

      {screening?.status === "complete" ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border p-4 portal-banner-success">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-900">Pros</p>
            <ul className="mt-2 space-y-1.5 text-sm text-emerald-950">
              {(screening.pros.length ? screening.pros : ["No standout positives flagged."]).map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border p-4 portal-banner-pending">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-900">Cons</p>
            <ul className="mt-2 space-y-1.5 text-sm text-amber-950">
              {(screening.cons.length ? screening.cons : ["No major concerns flagged."]).map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {screening ? (
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {screening.creditScore != null ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Credit score</dt>
              <dd className="mt-1 font-semibold text-foreground">{screening.creditScore}</dd>
            </div>
          ) : null}
          {screening.criminalFlags != null ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Criminal flags</dt>
              <dd className="mt-1 font-semibold text-foreground">{screening.criminalFlags}</dd>
            </div>
          ) : null}
          {screening.evictionFlags != null ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Eviction flags</dt>
              <dd className="mt-1 font-semibold text-foreground">{screening.evictionFlags}</dd>
            </div>
          ) : null}
          {screening.costCents != null ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Report cost</dt>
              <dd className="mt-1 font-semibold text-foreground">${(screening.costCents / 100).toFixed(2)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {screening?.adverseActionRequired ? (
        <p className="mt-4 rounded-xl border px-3 py-2 text-xs portal-banner-pending">
          Adverse action may be required before denying based on this consumer report (FCRA).
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {canOrder ? (
          <Button type="button" className="rounded-full px-5" disabled={busy} onClick={() => void runScreening()}>
            {busy ? "Ordering…" : screening?.status === "failed" ? "Re-run screening" : "Run screening"}
          </Button>
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
          <p className="text-xs text-muted">Turn screening on in Applications settings to order reports.</p>
        ) : settings?.mode === "auto_on_submit" ? (
          <p className="text-xs text-muted">Auto screening on submit is enabled (${(costCents / 100).toFixed(2)} / report).</p>
        ) : (
          <p className="text-xs text-muted">Manual screening — ${(costCents / 100).toFixed(2)} per report billed to your plan card.</p>
        )}
      </div>

      <div className="mt-5 border-t border-border pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Background check</p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              On-demand criminal background check via Checkr — returns a plain{" "}
              <span className="font-semibold text-foreground">Clear</span> or{" "}
              <span className="font-semibold text-foreground">Consider</span> result.
            </p>
          </div>
          {bg ? (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${backgroundCheckChip(bg).className}`}
            >
              {backgroundCheckChip(bg).label}
            </span>
          ) : null}
        </div>

        {bg?.result === "consider" ? (
          <p className="mt-4 rounded-xl border px-3 py-2 text-xs portal-banner-pending">
            Checkr flagged records to review. Consult the full Checkr report and applicable fair-chance rules before
            any adverse action (FCRA).
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {bgConfigured && row.application?.consentCredit && bg?.status !== "pending" ? (
            <Button
              type="button"
              data-attr="run-background-check"
              className="rounded-full px-5"
              disabled={bgBusy}
              onClick={runBackgroundCheck}
            >
              {bgBusy ? "Requesting…" : bg ? "Re-run background check" : "Run background check"}
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
          {!bgConfigured ? (
            <p className="text-xs text-muted">Add CHECKR_API_KEY to enable background checks.</p>
          ) : !row.application?.consentCredit ? (
            <p className="text-xs text-muted">Applicant must authorize a background check first.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
