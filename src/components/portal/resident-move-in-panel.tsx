import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { loadResidentMoveInForEmail } from "@/lib/resident-move-in-info";

type ResidentMoveInPanelProps = {
  residentEmail?: string | null;
};

export async function ResidentMoveInPanel({ residentEmail }: ResidentMoveInPanelProps) {
  const email = residentEmail?.trim().toLowerCase() || "";
  const resolved = email ? await loadResidentMoveInForEmail(email) : null;

  return (
    <ManagerPortalPageShell title="Move-in">
      <div className="space-y-6 text-sm leading-relaxed text-muted">
        {!email ? (
          <p className="rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-amber-950">
            Sign in to see move-in information for your placement.
          </p>
        ) : !resolved ? (
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-base font-semibold text-foreground">Move-in details</h2>
            <p className="mt-3 text-muted">
              We could not find an approved placement tied to this account yet. Once your property manager assigns your
              listing room, your move-in details will appear here automatically.
            </p>
          </section>
        ) : (
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
        )}
      </div>
    </ManagerPortalPageShell>
  );
}
