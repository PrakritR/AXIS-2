import { NextResponse } from "next/server";
import { fetchResidentSmsConversation } from "@/lib/manager-sms-messages.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const db = createSupabaseServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (String(profile?.role ?? "").trim().toLowerCase() !== "resident") {
    return NextResponse.json({ error: "Resident access required." }, { status: 403 });
  }

  try {
    const payload = await fetchResidentSmsConversation(db, user.id);
    return NextResponse.json(payload, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load SMS.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
