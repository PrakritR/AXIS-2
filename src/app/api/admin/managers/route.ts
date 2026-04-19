import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, manager_id, application_approved, created_at")
      .eq("role", "manager")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also get tier info from manager_purchases
    const emails = (data ?? []).map((p) => p.email).filter(Boolean);
    const { data: purchases } = await supabase
      .from("manager_purchases")
      .select("email, tier, billing, paid_at")
      .in("email", emails);

    const purchaseByEmail = new Map(purchases?.map((p) => [p.email, p]) ?? []);

    const managers = (data ?? []).map((profile) => {
      const purchase = purchaseByEmail.get(profile.email);
      return {
        id: profile.id,
        email: profile.email ?? "",
        fullName: profile.full_name ?? "",
        managerId: profile.manager_id ?? "",
        tier: purchase?.tier ?? "free",
        billing: purchase?.billing ?? "free",
        active: profile.application_approved !== false,
        joinedAt: profile.created_at ?? purchase?.paid_at ?? null,
      };
    });

    return NextResponse.json({ managers });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, active } = (await req.json()) as { id: string; active: boolean };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase
      .from("profiles")
      .update({ application_approved: active })
      .eq("id", id)
      .eq("role", "manager");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
