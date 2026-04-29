"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { ManagerSectionShell, PortalPropertyFilter } from "./manager-section-shell";
import { usePortalSession } from "@/hooks/use-portal-session";
import { readProRelationships, type ProRelationshipRecord } from "@/lib/pro-relationships";
import {
  PROPERTY_PIPELINE_EVENT,
  readAllExtraListings,
  readAllPendingManagerProperties,
} from "@/lib/demo-property-pipeline";

type LinkedPropertyCard = {
  id: string;
  label: string;
  status: string;
  relationshipLabel: string;
  inventory: string;
};

function relationshipLabelForRow(row: ProRelationshipRecord) {
  if (row.perspective === "manager_tab") return "They manage your properties";
  return "They own your properties";
}

export function OwnerProperties() {
  const { userId } = usePortalSession();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, bump);
    window.addEventListener("axis-pro-relationships", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, bump);
      window.removeEventListener("axis-pro-relationships", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const cards = useMemo<LinkedPropertyCard[]>(() => {
    void tick;
    if (!userId) return [];

    const live = readAllExtraListings();
    const pending = readAllPendingManagerProperties();
    const rels = readProRelationships(userId);
    const out: LinkedPropertyCard[] = [];

    for (const rel of rels) {
      for (const pid of rel.assignedPropertyIds) {
        const listed = live.find((row) => row.id === pid);
        if (listed) {
          out.push({
            id: pid,
            label: listed.title || [listed.buildingName, listed.unitLabel || listed.address].filter(Boolean).join(" · "),
            status: listed.adminPublishLive ? "Live listing" : "Linked listing",
            relationshipLabel: relationshipLabelForRow(rel),
            inventory: listed.unitLabel || `${listed.beds} rooms`,
          });
          continue;
        }

        const draft = pending.find((row) => row.id === pid);
        if (draft) {
          out.push({
            id: pid,
            label: [draft.buildingName, draft.unitLabel].filter(Boolean).join(" · "),
            status: "Pending approval",
            relationshipLabel: relationshipLabelForRow(rel),
            inventory: draft.unitLabel || `${draft.beds} rooms`,
          });
        }
      }
    }

    return out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [userId, tick]);

  return (
    <ManagerSectionShell
      title="Properties"
      filters={<PortalPropertyFilter />}
      actions={[{ label: "Refresh", variant: "outline" }]}
    >
      {cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center text-sm text-slate-500">
          No linked properties yet — once an account link is approved and properties are assigned, they will show here.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((p) => (
            <Card key={p.id} className="border-slate-200/80 p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-primary/80">{p.status}</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-950">{p.label}</h2>
              <p className="mt-1 text-sm font-medium text-emerald-700">{p.relationshipLabel}</p>
              <dl className="mt-4 space-y-2 text-sm text-slate-600">
                <div className="flex justify-between gap-3">
                  <dt>Inventory</dt>
                  <dd className="font-semibold text-slate-900">{p.inventory}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Access</dt>
                  <dd className="font-semibold text-slate-900">Linked through account links</dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      )}
    </ManagerSectionShell>
  );
}
