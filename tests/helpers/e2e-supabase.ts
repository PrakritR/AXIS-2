import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

export function mockFreeApplicationFee(page: Page) {
  return page.route("**/api/public/application-fee-preview", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        applicationFeeCents: 0,
        serviceFeeCents: 0,
        totalCents: 0,
        feePayer: "resident",
      }),
    });
  });
}

export async function resolveManagerUserId(db: SupabaseClient, email: string): Promise<string> {
  const { data: users } = await db.auth.admin.listUsers();
  const user = users?.users?.find((u) => u.email === email);
  if (!user?.id) throw new Error(`Manager not found: ${email}`);
  return user.id;
}

export async function setManagerApplicationFeeFree(db: SupabaseClient, managerUserId: string) {
  const { data: row } = await db
    .from("manager_automation_settings")
    .select("row_data")
    .eq("manager_user_id", managerUserId)
    .maybeSingle();
  const rowData = (row?.row_data && typeof row.row_data === "object" ? row.row_data : {}) as Record<string, unknown>;
  const { error } = await db.from("manager_automation_settings").upsert({
    manager_user_id: managerUserId,
    row_data: { ...rowData, applicationSettings: { applicationFeeCents: 0 } },
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
