"use client";

import { useCallback, useEffect, useState } from "react";
import { ManagerSectionShell } from "@/components/portal/manager-section-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { demoAdminPropertyRows } from "@/data/demo-portal";
import {
  approvePendingManagerProperty,
  PROPERTY_PIPELINE_EVENT,
  readExtraListings,
  readPendingManagerProperties,
  type ManagerPendingPropertyRow,
} from "@/lib/demo-property-pipeline";
import Link from "next/link";

export function AdminPropertiesClient() {
  const { showToast } = useAppUi();
  const [pending, setPending] = useState<ManagerPendingPropertyRow[]>([]);
  const [extraLen, setExtraLen] = useState(0);

  const refresh = useCallback(() => {
    setPending(readPendingManagerProperties());
    setExtraLen(readExtraListings().length);
  }, []);

  useEffect(() => {
    refresh();
    const on = () => refresh();
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, [refresh]);

  return (
    <ManagerSectionShell title="Properties" actions={[{ label: "Refresh", variant: "outline", onClick: refresh }]}>
      {pending.length > 0 ? (
        <div className="mb-8 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Pending manager submissions</p>
          <p className="text-sm text-slate-600">
            Approve a submission to publish it on the public listings grid (demo — stored in this browser).
          </p>
          <ul className="space-y-3">
            {pending.map((row) => (
              <li key={row.id}>
                <Card className="border-amber-200/80 bg-amber-50/40 p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {row.buildingName} · {row.unitLabel}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">{row.address}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.neighborhood} · ZIP {row.zip} · ${row.monthlyRent}/mo · {row.beds} bd / {row.baths} ba ·{" "}
                        {row.petFriendly ? "Pet-friendly" : "No pets"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      className="shrink-0 rounded-full"
                      onClick={() => {
                        const created = approvePendingManagerProperty(row.id);
                        if (!created) {
                          showToast("Could not approve this submission.");
                          return;
                        }
                        showToast(`Listing published: ${created.title} — open /rent/listings/${created.id}`);
                        refresh();
                      }}
                    >
                      Approve & publish listing
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Portfolio (demo seed)</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {demoAdminPropertyRows.map((r) => (
          <Card key={r.name} className="border-slate-200/80 p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">{r.name}</p>
            <p className="mt-1 text-xs text-slate-500">Manager: {r.manager}</p>
            <p className="mt-2 text-sm text-slate-600">
              {r.units} units · <span className="font-medium text-slate-800">{r.status}</span>
            </p>
          </Card>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-slate-500">
        {extraLen} manager-published listing{extraLen === 1 ? "" : "s"} in this browser.{" "}
        <Link href="/rent/listings" className="font-semibold text-primary hover:opacity-90">
          View public listings
        </Link>
      </p>
    </ManagerSectionShell>
  );
}
