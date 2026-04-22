import { AdminProfileClient } from "@/components/portal/admin-profile-client";
import { getServerSessionProfile } from "@/lib/auth/server-profile";

/** Avoid `.trim()` on non-strings from DB/JSON edge cases (would throw in RSC). */
function safeLine(value: unknown): string {
  const t = String(value ?? "").trim();
  return t.length ? t : "—";
}

/**
 * Admin profile — isolated server fetch with safe coercion so transient Supabase/auth
 * issues or odd row shapes don’t take down the whole `/admin/profile` segment.
 */
export async function AdminProfileSection() {
  try {
    const { profile, user } = await getServerSessionProfile();
    return (
      <AdminProfileClient
        fullName={safeLine(profile?.full_name)}
        email={safeLine(profile?.email ?? user?.email)}
        phone={safeLine(profile?.phone)}
        adminId={safeLine(profile?.id ?? user?.id)}
      />
    );
  } catch {
    return (
      <AdminProfileClient
        fullName="—"
        email="—"
        phone="—"
        adminId="—"
      />
    );
  }
}
