import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { fetchAdminSharedLineSmsConversation } from "@/lib/manager-sms-messages.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/** Admin Communication → SMS: read-only view of the shared Claw agent line. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!(await isAdminUser(user.id))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const db = createSupabaseServiceRoleClient();
    const payload = await fetchAdminSharedLineSmsConversation(db);
    return NextResponse.json(payload, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load SMS conversations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
