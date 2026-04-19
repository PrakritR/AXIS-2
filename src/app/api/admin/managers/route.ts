import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  application_approved: boolean;
  created_at: string;
};

type PurchaseRow = {
  email: string;
  tier: string | null;
  billing: string | null;
};

function formatAccountType(tier: string | null, billing: string | null): string {
  if (!tier) return "—";
  const t = tier.charAt(0).toUpperCase() + tier.slice(1);
  const b = billing ? " " + billing.charAt(0).toUpperCase() + billing.slice(1) : "";
  return t + b;
}

function formatJoined(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (!(await isAdminUser(user.id))) return null;
  return user;
}

export async function GET() {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const db = createSupabaseServiceRoleClient();

    const { data: profiles, error: profilesError } = await db
      .from("profiles")
      .select("id, email, full_name, application_approved, created_at")
      .eq("role", "manager")
      .order("created_at", { ascending: false });

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 });
    }

    const rows = (profiles ?? []) as ProfileRow[];
    const emails = rows.map((r) => r.email).filter(Boolean) as string[];

    let purchaseMap: Record<string, PurchaseRow> = {};
    if (emails.length > 0) {
      const { data: purchases } = await db
        .from("manager_purchases")
        .select("email, tier, billing")
        .in("email", emails);

      for (const p of (purchases ?? []) as PurchaseRow[]) {
        if (p.email) purchaseMap[p.email.toLowerCase()] = p;
      }
    }

    const managers = rows.map((r) => {
      const purchase = r.email ? purchaseMap[r.email.toLowerCase()] : null;
      return {
        id: r.id,
        name: r.full_name || r.email?.split("@")[0] || r.id.slice(0, 8),
        email: r.email || "",
        accountType: formatAccountType(purchase?.tier ?? null, purchase?.billing ?? null),
        joinedLabel: formatJoined(r.created_at),
        propertyGroup: "",
        status: (r.application_approved ? "active" : "disabled") as "active" | "disabled",
      };
    });

    const current = managers.filter((m) => m.status === "active").length;
    const past = managers.filter((m) => m.status === "disabled").length;

    return NextResponse.json({ managers, counts: { current, past } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load managers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id, status } = (await req.json()) as { id?: string; status?: string };
    if (!id || (status !== "active" && status !== "disabled")) {
      return NextResponse.json({ error: "id and status (active|disabled) are required." }, { status: 400 });
    }

    const db = createSupabaseServiceRoleClient();
    const { error } = await db
      .from("profiles")
      .update({ application_approved: status === "active", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("role", "manager");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update manager.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
