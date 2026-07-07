"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { ApplicationBackgroundCheck } from "@/lib/checkr/types";
import { applicationShowsBackgroundCheck } from "@/lib/application-background-check";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { buildBackgroundCheckReportHtml } from "@/lib/background-check-report-html";
import { MANAGER_PLAN_PORTAL_URL } from "@/lib/portals/manager-plan-path";
import type { ManagerScreeningSettings } from "@/lib/screening/types";

const DEMO_SCREENING_DEFAULTS = { mode: "manual" as const };

function backgroundCheckDocumentHref(applicationId: string, opts?: { attachment?: boolean }): string {
  const params = new URLSearchParams({ applicationId });
  if (opts?.attachment) params.set("disposition", "attachment");
  return `/api/screening/background-check/document?${params.toString()}`;
}

function downloadBackgroundCheckPdf(applicationId: string): void {
  const anchor = document.createElement("a");
  anchor.href = backgroundCheckDocumentHref(applicationId, { attachment: true });
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function BackgroundCheckReportFrame({ row, demo }: { row: DemoApplicantRow; demo: boolean }) {
  const bg = row.backgroundCheck;
  const useOfficialPdf = bg?.status === "complete" && !(bg.simulated && demo);
  const pdfSrc = useOfficialPdf
    ? `${backgroundCheckDocumentHref(row.id)}#toolbar=0&navpanes=0`
    : null;
  const reportHtml = useMemo(() => (useOfficialPdf ? "" : buildBackgroundCheckReportHtml(row)), [row, useOfficialPdf]);

  if (!pdfSrc && !reportHtml) {
    return (
      <div className="flex h-[min(24vh,200px)] items-center justify-center px-4 text-center text-sm text-muted">
        {demo
          ? "No screening report yet. Click Test to run a demo background check."
          : "No screening report yet."}
      </div>
    );
  }

  if (pdfSrc) {
    return (
      <iframe
        src={pdfSrc}
        title="Background check report preview"
        loading="lazy"
        className="h-[min(52vh,420px)] w-full border-0 bg-white"
      />
    );
  }

  return (
    <iframe
      srcDoc={reportHtml}
      title="Background check report preview"
      sandbox="allow-same-origin"
      loading="lazy"
      className="h-[min(52vh,420px)] w-full border-0 bg-white"
    />
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
  const demo = isDemoModeActive();
  const [settings, setSettings] = useState<ManagerScreeningSettings | null>(demo ? DEMO_SCREENING_DEFAULTS : null);
  const [configured, setConfigured] = useState(demo);
  const [screeningAllowed, setScreeningAllowed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bgConfigured, setBgConfigured] = useState(demo);
  const [bgOverride, setBgOverride] = useState<ApplicationBackgroundCheck | undefined>();
  const [bgBusy, setBgBusy] = useState(false);
  const bg = bgOverride ?? row.backgroundCheck;

  useEffect(() => {
    setBgOverride(undefined);
  }, [row.id, row.backgroundCheck?.status, row.backgroundCheck?.completedAt]);

  useEffect(() => {
    if (demo) return;
    void fetch("/api/screening/settings", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as {
          settings?: ManagerScreeningSettings;
          configured?: boolean;
          backgroundCheckConfigured?: boolean;
          screeningAllowed?: boolean;
        };
        if (body.settings) setSettings(body.settings);
        setConfigured(Boolean(body.configured));
        setBgConfigured(Boolean(body.backgroundCheckConfigured));
        setScreeningAllowed(body.screeningAllowed !== false);
      })
      .catch(() => undefined);
  }, [demo]);

  const callBackgroundCheck = useCallback(
    async (action: "refresh") => {
      if (demo) return;
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
    [demo, onUpdated, row.id],
  );

  useEffect(() => {
    if (demo || bg?.status !== "pending") return;
    let cancelled = false;
    const timer = setInterval(() => {
      if (cancelled) return;
      void callBackgroundCheck("refresh");
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [bg?.status, bg?.reportId, callBackgroundCheck, demo]);

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

  const handleDownload = useCallback(() => {
    if (demo) {
      void import("@/lib/demo/demo-document-files")
        .then(({ downloadDemoBackgroundCheckPdf }) => downloadDemoBackgroundCheckPdf({ ...row, backgroundCheck: bg }))
        .catch(() => showToast("Could not download screening report."));
      return;
    }
    downloadBackgroundCheckPdf(row.id);
  }, [bg, demo, row, showToast]);

  if (!applicationShowsBackgroundCheck(row)) return null;

  const screening = row.screening;
  const canOrder =
    !demo &&
    screeningAllowed &&
    configured &&
    settings?.mode !== "off" &&
    row.application?.consentCredit &&
    screening?.status !== "in_progress" &&
    screening?.status !== "queued" &&
    screening?.status !== "complete";

  const canRunBackgroundCheck =
    screeningAllowed &&
    bgConfigured &&
    Boolean(row.application?.consentCredit) &&
    bg?.status !== "pending" &&
    Boolean(onOpenScreeningModal);

  const testButtonLabel = demo ? "Test" : bg ? "Re-run background check" : "Run background check";

  const headerActions = (
    <>
      {bg?.status === "complete" ? (
        <Button
          type="button"
          variant="outline"
          className="h-8 rounded-full px-4 text-xs"
          data-attr="screening-pdf-download"
          onClick={handleDownload}
        >
          Download PDF
        </Button>
      ) : null}
      {canRunBackgroundCheck ? (
        <Button
          type="button"
          data-attr="run-background-check"
          className="h-8 rounded-full px-4 text-xs"
          onClick={onOpenScreeningModal}
        >
          {testButtonLabel}
        </Button>
      ) : null}
      {canOrder ? (
        <Button
          type="button"
          className="h-8 rounded-full px-4 text-xs"
          disabled={busy}
          onClick={() => void runScreening()}
        >
          {busy ? "Ordering…" : screening?.status === "failed" ? "Re-run screening" : "Run screening"}
        </Button>
      ) : null}
    </>
  );

  return (
    <PortalCollapsibleSection
      title="Screening"
      defaultExpanded={false}
      surfaceMuted={false}
      className="mt-4"
      contentClassName="p-4 pt-0"
      toggleDataAttr="application-screening-toggle"
      headerActions={headerActions}
    >
      {!screeningAllowed && !demo ? (
        <p className="text-xs text-muted">
          Screening requires Pro or Business.{" "}
          <Link href={MANAGER_PLAN_PORTAL_URL} className="font-semibold text-primary hover:underline">
            Upgrade your plan
          </Link>
        </p>
      ) : null}
      {bg?.status === "pending" ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{demo ? "Demo screening in progress…" : "Checkr is processing — status updates automatically."}</span>
          {!demo ? (
            <button
              type="button"
              className="font-semibold text-primary hover:underline disabled:opacity-50"
              disabled={bgBusy}
              onClick={() => void callBackgroundCheck("refresh")}
            >
              Refresh now
            </button>
          ) : null}
        </div>
      ) : null}
      {screening?.reportUrl ? (
        <Link
          href={screening.reportUrl.startsWith("http") ? screening.reportUrl : `https://${screening.reportUrl.replace(/^\/+/, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm font-semibold text-primary hover:underline"
        >
          View full vendor report
        </Link>
      ) : null}
      {screeningAllowed && configured && settings?.mode === "off" && !demo ? (
        <p className="text-xs text-muted">Screening is off in Applications settings.</p>
      ) : null}
      {screeningAllowed && !row.application?.consentCredit ? (
        <p className="text-xs text-muted">Applicant must authorize a background check first.</p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <BackgroundCheckReportFrame row={{ ...row, backgroundCheck: bg }} demo={demo} />
      </div>

      {screening?.adverseActionRequired ? (
        <p className="rounded-xl border px-3 py-2 text-xs portal-banner-pending">
          Adverse action may be required before denying based on this consumer report (FCRA).
        </p>
      ) : null}

      {bg?.result === "consider" ? (
        <p className="rounded-xl border px-3 py-2 text-xs portal-banner-pending">
          Checkr flagged records to review. Consult the full Checkr report and applicable fair-chance rules before any
          adverse action (FCRA).
        </p>
      ) : null}
    </PortalCollapsibleSection>
  );
}
