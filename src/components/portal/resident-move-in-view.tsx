"use client";

import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import type { ResidentMoveInResolved } from "@/lib/resident-move-in-resolve";

/** Resolved move-in details card — shared by the resident portal panel and the /demo sandbox. */
export function ResidentMoveInResolvedView({ resolved }: { resolved: ResidentMoveInResolved }) {
  return (
    <div className="space-y-4">
      <PortalCollapsibleSection
        title="Your placement"
        surfaceMuted={false}
        contentClassName="px-4 pb-4 text-muted"
        toggleDataAttr="resident-move-in-placement-toggle"
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

      {resolved.generalHouseInfo || resolved.houseRulesText ? (
        <PortalCollapsibleSection
          title="General info & house rules"
          surfaceMuted={false}
          contentClassName="space-y-3 px-4 pb-4 text-muted"
          toggleDataAttr="resident-move-in-house-info-toggle"
        >
          {resolved.generalHouseInfo ? <div className="whitespace-pre-wrap">{resolved.generalHouseInfo}</div> : null}
          {resolved.houseRulesText ? <div className="whitespace-pre-wrap">{resolved.houseRulesText}</div> : null}
        </PortalCollapsibleSection>
      ) : null}

      {resolved.wifiNetworkName || resolved.wifiPassword ? (
        <PortalCollapsibleSection
          title="House info"
          surfaceMuted={false}
          contentClassName="space-y-1 px-4 pb-4 text-muted"
          toggleDataAttr="resident-move-in-wifi-toggle"
        >
          {resolved.wifiNetworkName ? (
            <p>
              <span className="font-semibold text-foreground">WiFi network:</span> {resolved.wifiNetworkName}
            </p>
          ) : null}
          {resolved.wifiPassword ? (
            <p>
              <span className="font-semibold text-foreground">WiFi password:</span> {resolved.wifiPassword}
            </p>
          ) : null}
        </PortalCollapsibleSection>
      ) : null}

      <PortalCollapsibleSection
        title="Instructions & details"
        surfaceMuted={false}
        contentClassName="px-4 pb-4"
        toggleDataAttr="resident-move-in-instructions-toggle"
      >
        <div className="whitespace-pre-wrap text-muted">
          {resolved.instructions ?? (
            <span>
              No move-in instructions have been added for this room yet. Your property manager can add keys,
              parking, access codes, and house rules when they edit the listing.
            </span>
          )}
        </div>
      </PortalCollapsibleSection>
    </div>
  );
}
