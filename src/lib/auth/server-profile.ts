import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ServerProfile = {
  id: string;
  email: string | null;
  role: string;
  manager_id: string | null;
  full_name: string | null;
  application_approved: boolean;
};

export async function getServerSessionProfile(): Promise<{ user: { id: string; email?: string | null } | null; profile: ServerProfile | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { user: null, profile: null };

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

    return {
      user: { id: user.id, email: user.email },
      profile: profile as ServerProfile | null,
    };
  } catch {
    return { user: null, profile: null };
  }
}
