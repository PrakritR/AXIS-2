import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePortalRoles } from "@/lib/auth/portal-roles";
import { primaryRoleWhenAddingResident } from "@/lib/auth/profile-primary-role";
import { ensureProfileRoleRow } from "@/lib/auth/profile-role-row";
import {
  linkAllTourInquiriesForEmail,
  reconcileProspectInboxThreadsForResident,
} from "@/lib/tour-resident-link.server";

function normalizeEmail(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export type EnsureSignedInResidentResult =
  | { ok: true; createdResidentRole: boolean; email: string }
  | { ok: false; error: string };

/**
 * Add the resident role to the signed-in account when missing, then backfill
 * tour links and Communication threads for the account email.
 */
export async function ensureSignedInResidentAccount(
  service: SupabaseClient,
  user: { id: string; email?: string | null },
  options?: { contactEmail?: string | null; phone?: string | null },
): Promise<EnsureSignedInResidentResult> {
  const { data: existingProfile } = await service
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .maybeSingle();

  const authEmail = normalizeEmail(existingProfile?.email ?? user.email);
  if (!authEmail.includes("@")) {
    return { ok: false, error: "Profile email is required." };
  }
  const contactEmail = normalizeEmail(options?.contactEmail) || authEmail;

  const { data: existingRoleRows } = await service.from("profile_roles").select("role").eq("user_id", user.id);
  const currentRoles = normalizePortalRoles(existingRoleRows, existingProfile?.role as string | undefined);
  const hadResidentRole = currentRoles.includes("resident");

  if (!hadResidentRole) {
    const nextPrimaryRole = primaryRoleWhenAddingResident(existingProfile?.role as string | undefined);
    if (!existingProfile) {
      const { error } = await service
        .from("profiles")
        .insert({ id: user.id, email: contactEmail, role: nextPrimaryRole });
      if (error) return { ok: false, error: error.message };
    } else if (nextPrimaryRole !== existingProfile.role) {
      const { error } = await service.from("profiles").update({ role: nextPrimaryRole }).eq("id", user.id);
      if (error) return { ok: false, error: error.message };
    }

    for (const role of currentRoles) {
      if (role !== "resident") {
        await ensureProfileRoleRow(service, user.id, role);
      }
    }
    await ensureProfileRoleRow(service, user.id, "resident");
  }

  await linkAllTourInquiriesForEmail(service, { userId: user.id, email: contactEmail });
  await reconcileProspectInboxThreadsForResident(service, {
    userId: user.id,
    contactEmail,
    authEmail: contactEmail !== authEmail ? authEmail : undefined,
    phone: options?.phone,
  });

  return { ok: true, createdResidentRole: !hadResidentRole, email: contactEmail };
}
