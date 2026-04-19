import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

/** Sections available to free-tier managers (house posting only). */
export const FREE_MANAGER_SECTIONS = new Set(["dashboard", "properties", "inbox", "profile"]);

/**
 * Returns "free" if the manager's purchase row is tier free; "paid" if any paid tier;
 * null if no purchase row (legacy / unknown — treat as full access).
 */
export async function getManagerSubscriptionTier(userId: string): Promise<"free" | "paid" | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase.from("manager_purchases").select("tier").eq("user_id", userId).maybeSingle();
  if (!data?.tier) return null;
  if (String(data.tier).toLowerCase() === "free") return "free";
  return "paid";
}

export function managerSectionAllowedForTier(section: string, tier: "free" | "paid" | null): boolean {
  if (tier !== "free") return true;
  return FREE_MANAGER_SECTIONS.has(section);
}
