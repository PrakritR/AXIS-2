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
        ) : !resolved ? (
          <>
            <p className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-slate-800">
              Move-in details will appear here after your application is <span className="font-semibold">approved</span> and your
              room is linked to a listing. If you were just approved, refresh in a moment or check your email from the property
              team.
            </p>
            <section className="rounded-2xl border border-slate-200/70 bg-white/90 p-5">
              <h2 className="text-base font-semibold text-slate-900">What you&apos;ll find here</h2>
              <ul className="mt-3 list-inside list-disc space-y-2 text-slate-600">
                <li>Earliest move-in date for your room</li>
                <li>Practical instructions: keys, access, parking, building rules at move-in</li>
                <li>Anything else your manager added when they published the listing</li>
              </ul>
            </section>
          </>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-[var(--shadow-sm)]">
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Your placement</h2>
              <p className="mt-2 text-lg font-semibold text-slate-950">{resolved.propertyLabel}</p>
              {resolved.addressLine ? <p className="mt-1 text-slate-600">{resolved.addressLine}</p> : null}
              <p className="mt-3 text-sm font-medium text-slate-800">
                Room: <span className="font-semibold">{resolved.roomLabel}</span>
              </p>
            </section>

            <section className="rounded-2xl border border-slate-200/70 bg-white/90 p-5">
              <h2 className="text-base font-semibold text-slate-900">Move-in date</h2>
              <p className="mt-2 text-slate-700">
                {resolved.earliestMoveInDateLabel ? (
                  <span className="font-semibold text-slate-900">{resolved.earliestMoveInDateLabel}</span>
                ) : (
                  <span className="text-slate-500">
                    Your manager has not set an earliest move-in date on the listing for this room yet. Check with them or watch
                    for updates here after the listing is edited.
                  </span>
                )}
              </p>
            </section>

            <section className="rounded-2xl border border-slate-200/70 bg-white/90 p-5">
              <h2 className="text-base font-semibold text-slate-900">Instructions &amp; details</h2>
              <div className="mt-3 whitespace-pre-wrap text-slate-700">
                {resolved.instructions ?? (
                  <span className="text-slate-500">
                    No move-in instructions were added for this room yet. Your property manager can add keys, parking, access
                    codes, and a checklist when they edit the listing.
                  </span>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-5">
              <h2 className="text-base font-semibold text-slate-900">Also in your portal</h2>
              <ul className="mt-3 list-inside list-disc space-y-1.5 text-slate-600">
                <li>
                  <span className="font-medium text-slate-800">Lease</span> — sign when it&apos;s ready
                </li>
                <li>
                  <span className="font-medium text-slate-800">Payments</span> — rent, deposits, and charges
                </li>
                <li>
                  <span className="font-medium text-slate-800">Work orders</span> — maintenance requests
                </li>
              </ul>
            </section>
          </>
        )}
      </div>
    </ManagerPortalPageShell>
  );
}
