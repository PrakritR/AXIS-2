import { getPortalAccessContext, hasRole } from "@/lib/auth/portal-access";
import { ResidentApplicationsPanel } from "@/components/portal/resident-applications-panel";

export default async function ResidentApplyPage() {
  const ctx = await getPortalAccessContext();
  const hasResidentRole = hasRole(ctx, "resident");
  const signedInNonResident = Boolean(ctx.user) && !hasResidentRole;

  return (
    <ResidentApplicationsPanel
      applyMode
      signedInNonResident={signedInNonResident}
      hasResidentRole={hasResidentRole}
    />
  );
}
