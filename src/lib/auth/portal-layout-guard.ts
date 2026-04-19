import { redirect } from "next/navigation";
import { getAdminPreviewFromCookies } from "@/lib/auth/admin-preview";
import type { PreviewPortal } from "@/lib/auth/preview-types";
import { getServerSessionProfile } from "@/lib/auth/server-profile";

/**
 * Ensures only the correct role (or admin with matching preview cookie) can load a portal layout.
 */
export async function assertPortalLayoutRole(portal: PreviewPortal, role: "manager" | "resident" | "owner") {
  const session = await getServerSessionProfile();
  if (!session.user) redirect("/auth/sign-in");

  if (session.profile?.role === "admin") {
    const preview = await getAdminPreviewFromCookies();
    if (!preview || preview.portal !== portal) {
      redirect("/admin/dashboard");
    }
    return;
  }

  if (session.profile?.role !== role) {
    redirect("/auth/sign-in");
  }
}
