import { cache } from "react";
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

/** Coerces Supabase row fields so `.trim()` / JSX never receives numbers or odd types. */
function normalizeProfileRow(data: Record<string, unknown>, fallbackUserId: string): ServerProfile {
  const id = typeof data.id === "string" && data.id.trim() ? data.id.trim() : fallbackUserId;
  const email = data.email == null ? null : String(data.email);
  const role = typeof data.role === "string" && data.role.trim() ? data.role.trim() : "resident";
  const manager_id = data.manager_id == null || data.manager_id === "" ? null : String(data.manager_id);
  const full_name = data.full_name == null ? null : String(data.full_name);
  const phone = data.phone == null ? null : String(data.phone);
  let application_approved = false;
  const aa = data.application_approved;
  if (typeof aa === "boolean") application_approved = aa;
  else if (typeof aa === "string") application_approved = aa.toLowerCase() === "true";
  else if (typeof aa === "number") application_approved = aa !== 0;

  return {
    id,
    email,
    role,
    manager_id,
    full_name,
    phone,
    application_approved,
  };
}

export const getServerSessionProfile = cache(
  async (): Promise<{ user: { id: string; email?: string | null } | null; profile: ServerProfile | null }> => {
    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { user: null, profile: null };

      let profile: ServerProfile | null = null;
      try {
        const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
        if (!error && data && typeof data === "object") {
          profile = normalizeProfileRow(data as Record<string, unknown>, user.id);
        }
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
  },
);
