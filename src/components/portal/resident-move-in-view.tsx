"use client";

import { PortalListControlStack } from "@/components/portal/portal-list-control-stack";
import {
  RESIDENT_MOVE_IN_TAB_LABELS,
  residentMoveInHref,
  type ResidentMoveInTabId,
} from "@/lib/portal-detail-routes";
import type { ResidentMoveInResolved } from "@/lib/resident-move-in-resolve";

function availableTabs(resolved: ResidentMoveInResolved): ResidentMoveInTabId[] {
  const tabs: ResidentMoveInTabId[] = ["placement"];
  if (resolved.housemates.length > 0) tabs.push("housemates");
  if (resolved.generalHouseInfo || resolved.houseRulesText) tabs.push("info");
  tabs.push("instructions");
  return tabs;
}

/** Resolved house details — routed tabs instead of stacked disclosure sections. */
export function ResidentMoveInResolvedView({
  resolved,
  activeTab,
  basePath = "/resident",
}: {
  resolved: ResidentMoveInResolved;
  activeTab: ResidentMoveInTabId;
  basePath?: string;
}) {
  const tabs = availableTabs(resolved);
  const tab = tabs.includes(activeTab) ? activeTab : "placement";

  return (
    <div className="space-y-4 text-sm leading-relaxed text-muted">
      <PortalListControlStack
        className="mb-3 max-lg:mb-4"
        destinationInset
        destinations={tabs.map((id) => ({
          id,
          label: RESIDENT_MOVE_IN_TAB_LABELS[id],
          href: residentMoveInHref(basePath, id),
          dataAttr: `resident-move-in-tab-${id}`,
        }))}
        activeDestinationId={tab}
        destinationAriaLabel="House details"
      />

      {tab === "placement" ? (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Assigned room</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{resolved.roomLabel}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Property</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{resolved.propertyLabel}</p>
              {resolved.addressLine ? <p className="mt-0.5 text-xs">{resolved.addressLine}</p> : null}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Move-in date</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {resolved.earliestMoveInDateLabel ?? "Not set yet"}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "housemates" ? (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <ul className="divide-y divide-border">
            {resolved.housemates.map((mate) => (
              <li
                key={mate.email}
                className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{mate.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{mate.roomLabel}</p>
                </div>
                <div className="text-right text-sm text-muted">
                  {mate.phone ? (
                    <a
                      href={`tel:+1${mate.phone.replace(/\D/g, "").replace(/^1/, "")}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {mate.phone}
                    </a>
                  ) : (
                    <span>No phone on file</span>
                  )}
                  <p className="mt-0.5 text-xs">{mate.email}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "info" ? (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
          {resolved.generalHouseInfo ? <div className="whitespace-pre-wrap">{resolved.generalHouseInfo}</div> : null}
          {resolved.houseRulesText ? <div className="whitespace-pre-wrap">{resolved.houseRulesText}</div> : null}
        </section>
      ) : null}

      {tab === "instructions" ? (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="whitespace-pre-wrap">
            {resolved.instructions ?? (
              <span>
                No house instructions have been added for this room yet. Your property manager can add keys, parking,
                access codes, and house rules when they edit the listing.
              </span>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
