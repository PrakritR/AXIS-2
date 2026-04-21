import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_NAME = 200;
const MAX_PHONE = 40;

function looksLikeMissingPhoneColumn(err: { message?: string; code?: string }) {
  const m = (err.message ?? "").toLowerCase();
  return m.includes("phone") && (m.includes("column") || m.includes("schema") || m.includes("unknown"));
}

export async function PATCH(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    let body: { fullName?: unknown; phone?: unknown };
    try {
      body = (await req.json()) as { fullName?: unknown; phone?: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    const fullNameRaw = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const phoneRaw = typeof body.phone === "string" ? body.phone.trim() : "";

    if (fullNameRaw.length > MAX_NAME) {
      return NextResponse.json({ error: `Name must be at most ${MAX_NAME} characters.` }, { status: 400 });
    }
    if (phoneRaw.length > MAX_PHONE) {
      return NextResponse.json({ error: `Phone must be at most ${MAX_PHONE} characters.` }, { status: 400 });
    }

    const updatedAt = new Date().toISOString();
    let error = (
      await supabase
        .from("profiles")
        .update({
          full_name: fullNameRaw.length ? fullNameRaw : null,
          phone: phoneRaw.length ? phoneRaw : null,
          updated_at: updatedAt,
        })
        .eq("id", user.id)
    ).error;

    if (error && looksLikeMissingPhoneColumn(error)) {
      error = (
        await supabase
          .from("profiles")
          .update({
            full_name: fullNameRaw.length ? fullNameRaw : null,
            updated_at: updatedAt,
          })
          .eq("id", user.id)
      ).error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
