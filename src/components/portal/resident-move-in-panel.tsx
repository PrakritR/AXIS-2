import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { ResidentMoveInResolvedView } from "@/components/portal/resident-move-in-view";
import { loadResidentMoveInForEmail } from "@/lib/resident-move-in-info";

type ResidentMoveInPanelProps = {
  residentEmail?: string | null;
};

export async function ResidentMoveInPanel({ residentEmail }: ResidentMoveInPanelProps) {
  const email = residentEmail?.trim().toLowerCase() || "";
  const resolved = email ? await loadResidentMoveInForEmail(email) : null;

  return (
    <ManagerPortalPageShell title="House details">
      <div className="space-y-6 text-sm leading-relaxed text-muted">
        {!email ? (
          <p className="rounded-2xl border px-4 py-3 portal-banner-pending">
            Sign in to see house details for your placement.
          </p>
        ) : !resolved ? (
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-base font-semibold text-foreground">House details</h2>
            <p className="mt-3 text-muted">
              We could not find an approved placement tied to this account yet. Once your property manager assigns your
              listing room, your house details will appear here automatically.
            </p>
          </section>
        ) : (
          <ResidentMoveInResolvedView resolved={resolved} />
        )}
      </div>
    </ManagerPortalPageShell>
  );
}
