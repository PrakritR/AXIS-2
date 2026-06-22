import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { loadResidentMoveInForEmail } from "@/lib/resident-move-in-info";

function LockGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

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
          <div className="glass-card rounded-2xl px-5 py-6 text-center">
            <LockGlyph className="mx-auto h-8 w-8 text-muted" />
            <p className="mt-3 font-medium text-foreground">Sign in to view move-in details</p>
            <p className="mt-1 text-sm text-muted">Your placement information appears here once you are signed in.</p>
          </div>
        ) : !resolved ? (
          <section className="glass-card rounded-2xl p-6">
            <h2 className="text-base font-semibold text-foreground">Move-in details</h2>
            <p className="mt-3 text-muted">
              We could not find an approved placement tied to this account yet. Once your property manager assigns your
              listing room, your move-in details will appear here automatically.
            </p>
          </section>
        ) : (
          <section className="glass-card rounded-2xl p-5 sm:p-6">
            <div className="mb-5 grid gap-3 rounded-2xl border border-border bg-[var(--glass-fill)] p-4 sm:grid-cols-3">
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
