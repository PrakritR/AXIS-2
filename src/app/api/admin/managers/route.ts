import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { deleteManagerAccount } from "@/lib/auth/delete-portal-account";
import { applyAdminManagerPurchaseTier, type AdminManagerTier } from "@/lib/manager-admin-purchase";
import { resolveEffectiveManagerTier, syncManagerPurchaseTierState } from "@/lib/manager-tier-sync";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  return isAdminUser(user.id);
}

export async function GET() {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const supabase = createSupabaseServiceRoleClient();
    const { data: roleRows } = await supabase.from("profile_roles").select("user_id").eq("role", "manager");
    const idsFromRoles = [...new Set((roleRows ?? []).map((r) => r.user_id))];
    const { data: legacyRows } = await supabase.from("profiles").select("id").eq("role", "manager");
    const legacyIds = (legacyRows ?? []).map((p) => p.id);
    const allIds = [...new Set([...idsFromRoles, ...legacyIds])];

    if (allIds.length === 0) {
      return NextResponse.json({ managers: [] });
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, manager_id, application_approved, created_at")
      .in("id", allIds)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await Promise.all(
      (data ?? []).map(async (profile) => {
        try {
          await syncManagerPurchaseTierState(profile.id);
        } catch {
          /* keep serving last known DB state */
        }
      }),
    );

    // Tier info from manager_purchases (keyed by manager_id — unique per purchase row)
    const managerIds = (data ?? []).map((p) => p.manager_id).filter(Boolean) as string[];
    const { data: purchases } =
      managerIds.length > 0
        ? await supabase
            .from("manager_purchases")
            .select("manager_id, tier, billing, paid_at, stripe_subscription_id, stripe_checkout_session_id")
            .in("manager_id", managerIds)
        : { data: [] as never[] };

    const purchaseByManagerId = new Map(purchases?.map((p) => [p.manager_id, p]) ?? []);

    const managers = (data ?? []).map((profile) => {
      const purchase = profile.manager_id ? purchaseByManagerId.get(profile.manager_id) : undefined;
      const effectiveTier = purchase
        ? resolveEffectiveManagerTier(purchase) ?? "free"
        : "free";
      const billing =
        effectiveTier === "free" ? "free" : purchase?.billing ?? "free";
      return {
        id: profile.id,
        email: profile.email ?? "",
        fullName: profile.full_name ?? "",
        managerId: profile.manager_id ?? "",
        tier: effectiveTier,
        billing,
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
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const body = (await req.json()) as {
      id?: string;
      active?: boolean;
      fullName?: string;
      tier?: string;
      billing?: string;
    };
    const id = body.id;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const supabase = createSupabaseServiceRoleClient();

    if (typeof body.active === "boolean") {
      const { error } = await supabase.from("profiles").update({ application_approved: body.active }).eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (typeof body.fullName === "string") {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: body.fullName.trim() || null })
        .eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (typeof body.tier === "string" || typeof body.billing === "string") {
      const { data: profile } = await supabase.from("profiles").select("email, manager_id").eq("id", id).maybeSingle();
      if (!profile?.email || !profile.manager_id) {
        return NextResponse.json({ error: "Manager profile not found." }, { status: 404 });
      }

      const tierRaw = typeof body.tier === "string" ? body.tier.trim().toLowerCase() : undefined;
      const billingRaw = typeof body.billing === "string" ? body.billing.trim().toLowerCase() : undefined;

      if (
        tierRaw &&
        tierRaw !== "free" &&
        tierRaw !== "pro" &&
        tierRaw !== "business" &&
        tierRaw !== "pending"
      ) {
        return NextResponse.json({ error: "Invalid tier." }, { status: 400 });
      }
      if (
        billingRaw &&
        billingRaw !== "monthly" &&
        billingRaw !== "annual" &&
        billingRaw !== "free" &&
        billingRaw !== "portal"
      ) {
        return NextResponse.json({ error: "Invalid billing." }, { status: 400 });
      }

      const { data: existingPurchase } = await supabase
        .from("manager_purchases")
        .select("tier")
        .eq("manager_id", profile.manager_id)
        .maybeSingle();

      let tier: AdminManagerTier;
      if (tierRaw === "free" || tierRaw === "pro" || tierRaw === "business" || tierRaw === "pending") {
        tier = tierRaw;
      } else {
        const existing = existingPurchase?.tier?.toLowerCase();
        if (existing === "pro" || existing === "business" || existing === "free") {
          tier = existing;
        } else {
          tier = "pending";
        }
      }

      const result = await applyAdminManagerPurchaseTier(supabase, {
        userId: id,
        email: profile.email,
        managerId: profile.manager_id,
        tier,
        billing: billingRaw,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { id } = (await req.json()) as { id?: string };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const supabase = createSupabaseServiceRoleClient();
    const result = await deleteManagerAccount(supabase, id);
    return NextResponse.json({ ok: true, mode: result.mode });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
