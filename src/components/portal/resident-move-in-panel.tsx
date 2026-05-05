"use client";

import { useEffect, useMemo, useState } from "react";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { usePortalSession } from "@/hooks/use-portal-session";
import { MANAGER_APPLICATIONS_EVENT, readManagerApplicationRows, syncManagerApplicationsFromServer } from "@/lib/manager-applications-storage";
import { PROPERTY_PIPELINE_EVENT, readAllExtraListings, syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import { resolveResidentMoveInFromApplications } from "@/lib/resident-move-in-info";

export function ResidentMoveInPanel() {
  const session = usePortalSession();
  const email = session.email?.trim().toLowerCase() || "";
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    void syncManagerApplicationsFromServer({ force: true }).then(bump);
    void syncPropertyPipelineFromServer().then(bump);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, bump);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, bump);
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const resolved = useMemo(() => {
    void tick;
    void readAllExtraListings();
    if (!email) return null;
    return resolveResidentMoveInFromApplications(email, readManagerApplicationRows());
  }, [email, tick]);

  return (
    <ManagerPortalPageShell title="Move-in">
      <div className="space-y-6 text-sm leading-relaxed text-slate-700">
        {!email ? (
          <p className="rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-amber-950">
            Sign in to see move-in information for your placement.
          </p>
        ) : (
          <section className="rounded-2xl border border-slate-200/70 bg-white/90 p-5">
            <h2 className="text-base font-semibold text-slate-900">Instructions &amp; details</h2>
            <div className="mt-3 whitespace-pre-wrap text-slate-700">
              {resolved?.instructions ?? (
                <span className="text-slate-500">
                  No move-in instructions were added for this room yet. Your property manager can add keys, parking, access
                  codes, and a checklist when they edit the listing.
                </span>
              )}
            </div>
          </section>
        )}
      </div>
    </ManagerPortalPageShell>
  );
}
