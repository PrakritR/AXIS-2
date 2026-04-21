import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ServerProfile = {
  id: string;
  email: string | null;
  role: string;
  manager_id: string | null;
  full_name: string | null;
  /** Present after `profiles.phone` migration is applied. */
  phone?: string | null;
  application_approved: boolean;
};

export async function getServerSessionProfile(): Promise<{ user: { id: string; email?: string | null } | null; profile: ServerProfile | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { user: null, profile: null };

    let profile: ServerProfile | null = null;
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (!error && data) profile = data as ServerProfile;
    } catch {
      profile = null;
    }

    return {
      user: { id: user.id, email: user.email },
      profile,
    };
  } catch {
    return { user: null, profile: null };
  }
}
