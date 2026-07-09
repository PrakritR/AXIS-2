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

    // Security: `sms_from_number` (the manager's SMS work number) is NOT
    // self-settable here — the inbound webhook matches a manager by that value,
    // so a self-set field would let any user intercept another manager's texts.
    // It is provisioned out-of-band (admin/service role) only. And changing the
    // personal `phone` INVALIDATES verification (clears phone_verified_at), so
    // the inbound-forward gate can never forward to an unverified number.
    const nextPhone = phoneRaw.length ? phoneRaw : null;
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", user.id)
      .maybeSingle();
    const phoneChanged = String(currentProfile?.phone ?? "") !== String(nextPhone ?? "");

    const updatedAt = new Date().toISOString();
    let error = (
      await supabase
        .from("profiles")
        .update({
          full_name: fullNameRaw.length ? fullNameRaw : null,
          phone: nextPhone,
          ...(phoneChanged ? { phone_verified_at: null } : {}),
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
