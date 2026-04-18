"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  demoResidentLeaseChecklist,
  demoResidentLeaseHub,
  demoResidentLeaseVersions,
} from "@/data/demo-portal";
import { PortalLeaseWorkflowClient } from "@/components/portal/portal-lease-workflow-client";
import { ManagerSectionShell } from "./manager-section-shell";

type ChecklistRow = { id: string; label: string; done: boolean };

export function ResidentLeasePanel() {
  const { showToast } = useAppUi();
  const [checklist, setChecklist] = useState<ChecklistRow[]>(() =>
    demoResidentLeaseChecklist.map((c) => ({ id: c.id, label: c.label, done: c.done })),
  );

  return (
    <ManagerSectionShell
      title="Lease"
      actions={[
        { label: "Request extension", variant: "outline" },
        { label: "Download PDF", variant: "outline" },
        { label: "Sign lease", variant: "primary" },
      ]}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-slate-200/80 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Term & move-in</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Move-in</dt>
              <dd className="font-semibold text-slate-900">{demoResidentLeaseHub.moveIn}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Lease term</dt>
              <dd className="text-right font-semibold text-slate-900">{demoResidentLeaseHub.termLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Security deposit</dt>
              <dd className="font-semibold text-slate-900">{demoResidentLeaseHub.deposit}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Payment at signing</dt>
              <dd className="text-right font-semibold text-slate-900">{demoResidentLeaseHub.paymentAtSigning}</dd>
            </div>
          </dl>
        </Card>

        <Card className="flex min-h-[220px] flex-col border-dashed border-slate-200/90 bg-slate-50/50 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">PDF viewer</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{demoResidentLeaseHub.pdfName}</p>
          <p className="mt-2 flex-1 text-sm text-slate-600">
            Preview is simulated in this demo. Use download to keep a local copy while Axis finalizes e-sign routing.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => showToast("Upload PDF (demo).")}>
              Upload revision
            </Button>
            <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => showToast("Opened v5 (demo).")}>
              Open latest
            </Button>
          </div>
        </Card>
      </div>

      <div className="mt-10 border-t border-slate-200 pt-8">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Your lease draft &amp; messages</p>
        <p className="mt-1 text-sm text-slate-500">Demo: print-ready lease, thread without admin-only notes, and fees your manager posts.</p>
        <div className="mt-4">
          <PortalLeaseWorkflowClient mode="resident" />
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="border-slate-200/80 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Version history</p>
          <ul className="mt-3 space-y-2 text-sm">
            {demoResidentLeaseVersions.map((v) => (
              <li key={v.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                <p className="font-medium text-slate-900">{v.label}</p>
                <p className="mt-0.5 text-xs text-slate-600">{v.note}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="border-slate-200/80 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Prerequisite checklist</p>
          <ul className="mt-3 space-y-2">
            {checklist.map((item) => (
              <li key={item.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary"
                    checked={item.done}
                    onChange={() =>
                      setChecklist((rows) => rows.map((r) => (r.id === item.id ? { ...r, done: !r.done } : r)))
                    }
                  />
                  <span>{item.label}</span>
                </label>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            className="mt-4 rounded-full"
            variant="outline"
            onClick={() => showToast("Comment sent to manager (demo).")}
          >
            Add comment for manager
          </Button>
        </Card>
      </div>
    </ManagerSectionShell>
  );
}
