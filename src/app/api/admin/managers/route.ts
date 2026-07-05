import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { backfillOrphanGoogleOAuthManagers } from "@/lib/auth/provision-free-manager-oauth";
import { deletePortalAccountCompletely } from "@/lib/auth/delete-portal-account";
import { normalizeManagerSkuTier, pickBestManagerPurchaseRow } from "@/lib/manager-access";
import { setManagerPurchaseTier } from "@/lib/manager-access-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPortalSandboxEmail } from "@/lib/portal-sandbox-accounts";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

async function requireAdminActor(): Promise<{ ok: true; actorId: string } | { ok: false }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdminUser(user.id))) return { ok: false };
  return { ok: true, actorId: user.id };
}

export async function GET() {
  try {
    if (!(await requireAdminActor()).ok) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const supabase = createSupabaseServiceRoleClient();
    await backfillOrphanGoogleOAuthManagers(supabase).catch((err) => {
      console.error("Google/Gmail manager backfill failed:", err);
    });
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

    // Also get tier info from manager_purchases
    const emails = (data ?? []).map((p) => p.email).filter(Boolean);
    const [{ data: purchasesByEmail }, { data: purchasesByUserId }] = await Promise.all([
      emails.length > 0
        ? supabase
            .from("manager_purchases")
            .select("id, email, user_id, tier, billing, paid_at, stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id")
            .in("email", emails)
        : Promise.resolve({
            data: [] as {
              id: string;
              email: string;
              user_id: string | null;
              tier: string | null;
              billing: string | null;
              paid_at: string | null;
              stripe_customer_id: string | null;
              stripe_subscription_id: string | null;
              stripe_checkout_session_id: string | null;
            }[],
          }),
      supabase
        .from("manager_purchases")
        .select("id, email, user_id, tier, billing, paid_at, stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id")
        .in("user_id", allIds),
    ]);

    const purchasesByProfileId = new Map<string, typeof purchasesByUserId>();
    for (const profile of data ?? []) {
      const email = String(profile.email ?? "").toLowerCase();
      const rows = [
        ...(purchasesByUserId ?? []).filter((p) => p.user_id === profile.id),
        ...(purchasesByEmail ?? []).filter((p) => String(p.email ?? "").toLowerCase() === email),
      ];
      const merged = new Map<string, (typeof rows)[number]>();
      for (const row of rows) merged.set(String(row.id), row);
      purchasesByProfileId.set(profile.id, [...merged.values()]);
    }

    const managers = (data ?? [])
      .filter((profile) => !isPortalSandboxEmail(profile.email))
      .map((profile) => {
        const rows = purchasesByProfileId.get(profile.id) ?? [];
        const purchase = pickBestManagerPurchaseRow(
          rows.map((r) => ({
            id: String(r.id),
            tier: r.tier,
            billing: r.billing,
            paid_at: r.paid_at,
            user_id: r.user_id,
            stripe_customer_id: r.stripe_customer_id,
            stripe_subscription_id: r.stripe_subscription_id,
            stripe_checkout_session_id: r.stripe_checkout_session_id ?? null,
          })),
          profile.id,
        );
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
    if (!(await requireAdminActor()).ok) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const body = (await req.json()) as { id?: string; active?: boolean; tier?: string };
    const { id, active, tier } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    if (typeof active !== "boolean" && tier === undefined) {
      return NextResponse.json({ error: "Provide active and/or tier to update." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();

    if (typeof active === "boolean") {
      const { error } = await supabase.from("profiles").update({ application_approved: active }).eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (tier !== undefined) {
      const normalizedTier = normalizeManagerSkuTier(tier);
      if (!normalizedTier) {
        return NextResponse.json({ error: "tier must be free, pro, or business." }, { status: 400 });
      }
      const result = await setManagerPurchaseTier(id, normalizedTier, { adminOverride: true });
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
    const auth = await requireAdminActor();
    if (!auth.ok) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { id } = (await req.json()) as { id?: string };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    if (id === auth.actorId) {
      return NextResponse.json({ error: "You cannot delete your own account while signed in." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const result = await deletePortalAccountCompletely(supabase, id);
    return NextResponse.json({ ok: true, mode: result.mode });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
