import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

async function sessionUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  try {
    const db = createSupabaseServiceRoleClient();
    const [content, config, presets] = await Promise.all([
      db.from("site_content_records").select("id, page_key, section_key, content_key, locale, row_data, updated_at"),
      db.from("site_config_records").select("id, config_key, row_data, updated_at"),
      db.from("site_preset_records").select("id, preset_group, preset_key, row_data, updated_at"),
    ]);
    if (content.error) return NextResponse.json({ error: content.error.message }, { status: 500 });
    if (config.error) return NextResponse.json({ error: config.error.message }, { status: 500 });
    if (presets.error) return NextResponse.json({ error: presets.error.message }, { status: 500 });
    return NextResponse.json({
      content: content.data ?? [],
      config: config.data ?? [],
      presets: presets.data ?? [],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load site content.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await sessionUser();
    if (!user || !(await isAdminUser(user.id))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const body = (await req.json()) as {
      table?: "content" | "config" | "preset";
      row?: Record<string, unknown>;
    };
    if (!body.table || !body.row?.id) return NextResponse.json({ error: "table and row required" }, { status: 400 });
    const db = createSupabaseServiceRoleClient();
    const now = new Date().toISOString();
    const table =
      body.table === "content"
        ? "site_content_records"
        : body.table === "preset"
          ? "site_preset_records"
          : "site_config_records";
    const { error } = await db.from(table).upsert({ ...body.row, updated_at: now }, { onConflict: "id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save site content.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
