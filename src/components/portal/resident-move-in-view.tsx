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
      {resolved.generalHouseInfo ? (
        <div className="mb-5">
          <h2 className="text-base font-semibold text-foreground">General info</h2>
          <div className="mt-3 whitespace-pre-wrap text-muted">{resolved.generalHouseInfo}</div>
        </div>
      ) : null}
      {resolved.houseRulesText ? (
        <div className="mb-5">
          <h2 className="text-base font-semibold text-foreground">House rules</h2>
          <div className="mt-3 whitespace-pre-wrap text-muted">{resolved.houseRulesText}</div>
        </div>
      ) : null}
      {resolved.wifiNetworkName || resolved.wifiPassword || resolved.amenities.length > 0 ? (
        <div className="mb-5">
          <h2 className="text-base font-semibold text-foreground">House info</h2>
          {resolved.wifiNetworkName || resolved.wifiPassword ? (
            <div className="mt-3 grid gap-3 rounded-xl border border-border bg-accent/30 p-4 sm:grid-cols-2">
              {resolved.wifiNetworkName ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">WiFi network</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{resolved.wifiNetworkName}</p>
                </div>
              ) : null}
              {resolved.wifiPassword ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">WiFi password</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-foreground">{resolved.wifiPassword}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {resolved.amenities.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Amenities offered</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {resolved.amenities.map((amenity) => (
                  <li
                    key={amenity}
                    className="rounded-full border border-border bg-accent/30 px-3 py-1 text-xs font-medium text-foreground"
                  >
                    {amenity}
                  </li>
                ))}
              </ul>
            </div>
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
