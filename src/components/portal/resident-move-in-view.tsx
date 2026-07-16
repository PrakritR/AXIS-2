"use client";

import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import type { ResidentMoveInResolved } from "@/lib/resident-move-in-resolve";

/** Resolved house details card — shared by the resident portal panel and the /demo sandbox. */
export function ResidentMoveInResolvedView({ resolved }: { resolved: ResidentMoveInResolved }) {
  return (
    <div className="space-y-4">
      <PortalCollapsibleSection
        title="Your placement"
        surfaceMuted={false}
        contentClassName="px-4 pb-4 text-muted"
        toggleDataAttr="resident-house-details-placement-toggle"
      >
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
            <p className="mt-1 text-sm font-semibold text-foreground">{resolved.earliestMoveInDateLabel ?? "Not set yet"}</p>
          </div>
        </div>
      </PortalCollapsibleSection>

      {resolved.housemates.length > 0 ? (
        <PortalCollapsibleSection
          title="People in this house"
          surfaceMuted={false}
          contentClassName="px-4 pb-4"
          toggleDataAttr="resident-house-details-housemates-toggle"
        >
          <ul className="divide-y divide-border">
            {resolved.housemates.map((mate) => (
              <li key={mate.email} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-semibold text-foreground">{mate.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{mate.roomLabel}</p>
                </div>
                <div className="text-right text-sm text-muted">
                  {mate.phone ? (
                    <a href={`tel:+1${mate.phone.replace(/\D/g, "").replace(/^1/, "")}`} className="font-medium text-foreground hover:text-primary">
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
        </PortalCollapsibleSection>
      ) : null}

      {resolved.generalHouseInfo || resolved.houseRulesText ? (
        <PortalCollapsibleSection
          title="General info & house rules"
          surfaceMuted={false}
          contentClassName="space-y-3 px-4 pb-4 text-muted"
          toggleDataAttr="resident-house-details-house-info-toggle"
        >
          {resolved.generalHouseInfo ? <div className="whitespace-pre-wrap">{resolved.generalHouseInfo}</div> : null}
          {resolved.houseRulesText ? <div className="whitespace-pre-wrap">{resolved.houseRulesText}</div> : null}
        </PortalCollapsibleSection>
      ) : null}

      <PortalCollapsibleSection
        title="Instructions & details"
        surfaceMuted={false}
        contentClassName="px-4 pb-4"
        toggleDataAttr="resident-house-details-instructions-toggle"
      >
        <div className="whitespace-pre-wrap text-muted">
          {resolved.instructions ?? (
            <span>
              No house instructions have been added for this room yet. Your property manager can add keys,
              parking, access codes, and house rules when they edit the listing.
            </span>
          )}
        </div>
      </PortalCollapsibleSection>
    </div>
  );
}
