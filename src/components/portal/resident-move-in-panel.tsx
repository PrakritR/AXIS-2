import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { ResidentMoveInShell } from "@/components/portal/resident-move-in-view";
import { RESIDENT_PORTAL_BASE_PATH } from "@/lib/portals/resident-sections";
import { loadResidentMoveInForEmail } from "@/lib/resident-move-in-info";

type ResidentMoveInPanelProps = {
  residentEmail?: string | null;
  basePath?: string;
};

export async function ResidentMoveInPanel({
  residentEmail,
  basePath = RESIDENT_PORTAL_BASE_PATH,
}: ResidentMoveInPanelProps) {
  const email = residentEmail?.trim().toLowerCase() || "";
  const resolved = email ? await loadResidentMoveInForEmail(email) : null;

  return (
    <ManagerPortalPageShell title="House details" hideTitleOnMobileNav>
      <ResidentMoveInShell basePath={basePath} resolved={resolved} email={email} />
    </ManagerPortalPageShell>
  );
}
