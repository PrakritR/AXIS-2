import { getEffectiveSessionForPortal } from "@/lib/auth/effective-session";
import { getManagerSubscriptionTierByManagerId } from "@/lib/manager-access-server";
import { loadResidentPortalAccessState, residentPortalHomePath } from "@/lib/resident-portal-access";
import { redirect } from "next/navigation";

export default async function ResidentIndexPage() {
  const { profile, user } = await getEffectiveSessionForPortal("resident");
  const managerSubscriptionTier = profile?.manager_id?.trim()
    ? await getManagerSubscriptionTierByManagerId(profile.manager_id.trim())
    : null;
  const access = await loadResidentPortalAccessState({
    userId: user?.id ?? null,
    role: profile?.role,
    email: profile?.email ?? user?.email ?? null,
    managerSubscriptionTier,
  });
  redirect(residentPortalHomePath(access));
}
