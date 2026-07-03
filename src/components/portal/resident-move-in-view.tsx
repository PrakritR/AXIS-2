import type { ResidentMoveInResolved } from "@/lib/resident-move-in-resolve";

/** Resolved move-in details card — shared by the resident portal panel and the /demo sandbox. */
export function ResidentMoveInResolvedView({ resolved }: { resolved: ResidentMoveInResolved }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-5 grid gap-3 rounded-2xl border border-border bg-accent/30 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Assigned room</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{resolved.roomLabel}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Property</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{resolved.propertyLabel}</p>
          {resolved.addressLine ? <p className="mt-0.5 text-xs text-muted">{resolved.addressLine}</p> : null}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Move-in date</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{resolved.earliestMoveInDateLabel ?? "Not set yet"}</p>
        </div>
      </div>
      {resolved.generalHouseInfo || resolved.houseRulesText ? (
        <div className="mb-5">
          <h2 className="text-base font-semibold text-foreground">General info &amp; house rules</h2>
          {resolved.generalHouseInfo ? (
            <div className="mt-3 whitespace-pre-wrap text-muted">{resolved.generalHouseInfo}</div>
          ) : null}
          {resolved.houseRulesText ? (
            <div className="mt-3 whitespace-pre-wrap text-muted">{resolved.houseRulesText}</div>
          ) : null}
        </div>
      ) : null}
      {resolved.wifiNetworkName || resolved.wifiPassword ? (
        <div className="mb-5">
          <h2 className="text-base font-semibold text-foreground">House info</h2>
          {resolved.wifiNetworkName ? (
            <p className="mt-3 text-muted">
              <span className="font-semibold text-foreground">WiFi network:</span> {resolved.wifiNetworkName}
            </p>
          ) : null}
          {resolved.wifiPassword ? (
            <p className="mt-1 text-muted">
              <span className="font-semibold text-foreground">WiFi password:</span> {resolved.wifiPassword}
            </p>
          ) : null}
        </div>
      ) : null}
      <h2 className="text-base font-semibold text-foreground">Instructions &amp; details</h2>
      <div className="mt-3 whitespace-pre-wrap text-muted">
        {resolved.instructions ?? (
          <span className="text-muted">
            No move-in instructions have been added for this room yet. Your property manager can add keys,
            parking, access codes, and house rules when they edit the listing.
          </span>
        )}
      </div>
    </section>
  );
}
