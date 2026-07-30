import { ManagerPortalPageShell, PORTAL_INLINE_UNLOCK_NOTICE_CLASS } from "@/components/portal/portal-metrics";
import { ResidentMoveInResolvedView } from "@/components/portal/resident-move-in-view";
import { parseResidentMoveInTab, type ResidentMoveInTabId } from "@/lib/portal-detail-routes";
import { RESIDENT_PORTAL_BASE_PATH } from "@/lib/portals/resident-sections";
import { loadResidentMoveInForEmail } from "@/lib/resident-move-in-info";

type ResidentMoveInPanelProps = {
  residentEmail?: string | null;
  tab?: string;
  basePath?: string;
};

export async function ResidentMoveInPanel({
  residentEmail,
  tab: tabRaw,
  basePath = RESIDENT_PORTAL_BASE_PATH,
}: ResidentMoveInPanelProps) {
  const email = residentEmail?.trim().toLowerCase() || "";
  const tab: ResidentMoveInTabId = parseResidentMoveInTab(tabRaw);
  const resolved = email ? await loadResidentMoveInForEmail(email) : null;

  return (
    <ManagerPortalPageShell title="House details" hideTitleOnMobileNav compactFilterRow>
      <div className="text-sm leading-relaxed text-muted">
        {!email ? (
          <p className={`${PORTAL_INLINE_UNLOCK_NOTICE_CLASS} portal-banner-pending`}>
            Sign in to see house details for your placement.
          </p>
        ) : !resolved ? (
          <p className={PORTAL_INLINE_UNLOCK_NOTICE_CLASS}>
            <span className="font-semibold">No placement assigned yet.</span> Once your property manager assigns your
            listing room, your house details will appear here automatically.
          </p>
        ) : (
          <ResidentMoveInResolvedView resolved={resolved} activeTab={tab} basePath={basePath} />
        )}
      </div>
    </ManagerPortalPageShell>
  );
}
