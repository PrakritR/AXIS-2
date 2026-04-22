import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  looksLikeAccountLinksMissingTable,
  type AccountLinkInviteDto,
  type AccountLinkTabKind,
  type AccountLinksPayload,
} from "@/lib/account-links";
import { getManagerPurchaseSku, maxAccountLinksForTier } from "@/lib/manager-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export type InviteRow = {
  id: string;
  inviter_user_id: string;
  invitee_user_id: string;
  tab_kind: string;
  inviter_axis_id: string;
  invitee_axis_id: string;
  inviter_display_name: string | null;
  invitee_display_name: string | null;
  assigned_property_ids: unknown;
  payout_percent_for_manager: number;
  status: string;
  created_at: string;
  responded_at: string | null;
};

export function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string") as string[];
}

export function serializeInvite(row: InviteRow, viewerId: string): AccountLinkInviteDto {
  const out = row.inviter_user_id === viewerId;
  const linkedAxisId = out ? row.invitee_axis_id : row.inviter_axis_id;
  const linkedDisplayName = out ? row.invitee_display_name : row.inviter_display_name;
  return {
    id: row.id,
    tabKind: row.tab_kind === "manager" ? "manager" : "owner",
    status:
      row.status === "accepted" ||
      row.status === "rejected" ||
      row.status === "cancelled" ||
      row.status === "pending"
        ? row.status
        : "pending",
    direction: out ? "outgoing" : "incoming",
    inviterAxisId: row.inviter_axis_id,
    inviteeAxisId: row.invitee_axis_id,
    inviterDisplayName: row.inviter_display_name,
    inviteeDisplayName: row.invitee_display_name,
    linkedAxisId,
    linkedDisplayName,
    assignedPropertyIds: asStringArray(row.assigned_property_ids),
    payoutPercentForManager: Number(row.payout_percent_for_manager),
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  };
}

async function userHasPortalRole(
  supabase: SupabaseClient,
  userId: string,
  role: "owner" | "manager",
): Promise<boolean> {
  const { data: pr } = await supabase
    .from("profile_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();
  if (pr?.role === role) return true;
  const { data: p } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  return String((p as { role?: string } | null)?.role ?? "").toLowerCase() === role;
}

export async function GET(): Promise<NextResponse<AccountLinksPayload | { error: string }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("account_link_invites")
      .select(
        [
          "id",
          "inviter_user_id",
          "invitee_user_id",
          "tab_kind",
          "inviter_axis_id",
          "invitee_axis_id",
          "inviter_display_name",
          "invitee_display_name",
          "assigned_property_ids",
          "payout_percent_for_manager",
          "status",
          "created_at",
          "responded_at",
        ].join(","),
      )
      .or(`inviter_user_id.eq.${user.id},invitee_user_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      if (looksLikeAccountLinksMissingTable(error)) {
        return NextResponse.json({ invites: [], migrationRequired: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = ((data ?? []) as unknown) as InviteRow[];
    const invites = rows.map((r) => serializeInvite(r, user.id));
    return NextResponse.json({ invites });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as {
      inviteeAxisId?: string;
      tabKind?: string;
      assignedPropertyIds?: unknown;
      payoutPercentForManager?: number;
    } | null;

    const inviteeAxisId = body?.inviteeAxisId?.trim() ?? "";
    const tabKind = (body?.tabKind ?? "").toLowerCase() as AccountLinkTabKind;
    const assignedPropertyIds = asStringArray(body?.assignedPropertyIds);
    const payoutPercentForManager = Math.min(
      100,
      Math.max(0, Math.round(Number(body?.payoutPercentForManager ?? 15) * 10) / 10),
    );

    if (!inviteeAxisId) {
      return NextResponse.json({ error: "inviteeAxisId is required." }, { status: 400 });
    }
    if (tabKind !== "owner" && tabKind !== "manager") {
      return NextResponse.json({ error: "tabKind must be owner or manager." }, { status: 400 });
    }
    if (assignedPropertyIds.length === 0) {
      return NextResponse.json({ error: "Select at least one property for this invite." }, { status: 400 });
    }

    const inviterRole: "owner" | "manager" = tabKind === "owner" ? "owner" : "manager";
    const inviteeRole: "owner" | "manager" = tabKind === "owner" ? "owner" : "manager";

    const inviterOk = await userHasPortalRole(supabase, user.id, inviterRole);
    if (!inviterOk) {
      return NextResponse.json(
        {
          error:
            tabKind === "owner"
              ? "Only an owner workspace can send invites on the Owner tab."
              : "Only a manager workspace can send invites on the Manager tab.",
        },
        { status: 403 },
      );
    }

    const svc = createSupabaseServiceRoleClient();

    const { data: inviterProfile, error: inviterErr } = await svc
      .from("profiles")
      .select("manager_id, full_name, email, role")
      .eq("id", user.id)
      .maybeSingle();

    if (inviterErr || !inviterProfile?.manager_id) {
      return NextResponse.json({ error: inviterErr?.message ?? "Missing profile axis id." }, { status: 400 });
    }

    const inviterAxisId = String(inviterProfile.manager_id);

    const { data: inviteeProfile, error: inviteeErr } = await svc
      .from("profiles")
      .select("id, manager_id, full_name, email, role")
      .eq("manager_id", inviteeAxisId)
      .maybeSingle();

    if (inviteeErr) {
      if (looksLikeAccountLinksMissingTable(inviteeErr)) {
        return NextResponse.json(
          {
            error:
              "Database is missing account_link_invites. Apply supabase/migrations/20260422120000_account_link_invites.sql.",
            migrationRequired: true,
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: inviteeErr.message }, { status: 500 });
    }
    if (!inviteeProfile?.id) {
      return NextResponse.json({ error: "No account found with this Axis ID." }, { status: 404 });
    }

    const ir = String((inviteeProfile as { role?: string }).role ?? "").toLowerCase();
    if (ir !== inviteeRole) {
      return NextResponse.json(
        {
          error:
            tabKind === "owner"
              ? "On the Owner tab, enter another owner workspace's Axis ID."
              : "On the Manager tab, enter another manager workspace's Axis ID.",
        },
        { status: 400 },
      );
    }

    if (inviteeProfile.id === user.id) {
      return NextResponse.json({ error: "You cannot invite your own workspace." }, { status: 400 });
    }

    const { tier: inviterTier } = await getManagerPurchaseSku(user.id);
    const linkCap = maxAccountLinksForTier(inviterTier);
    if (linkCap != null) {
      const { count: used, error: capErr } = await svc
        .from("account_link_invites")
        .select("id", { count: "exact", head: true })
        .eq("inviter_user_id", user.id)
        .eq("tab_kind", tabKind)
        .in("status", ["pending", "accepted"]);

      if (capErr) {
        if (looksLikeAccountLinksMissingTable(capErr)) {
          return NextResponse.json(
            {
              error:
                "Database is missing account_link_invites. Apply supabase/migrations/20260422120000_account_link_invites.sql.",
              migrationRequired: true,
            },
            { status: 503 },
          );
        }
        return NextResponse.json({ error: capErr.message }, { status: 500 });
      }
      if ((used ?? 0) >= linkCap) {
        return NextResponse.json(
          {
            error: `Plan limit: ${linkCap} link${linkCap === 1 ? "" : "s"} max per tab.`,
          },
          { status: 403 },
        );
      }
    }

    const { data: insertRow, error: insertErr } = await svc
      .from("account_link_invites")
      .insert({
        inviter_user_id: user.id,
        invitee_user_id: inviteeProfile.id,
        tab_kind: tabKind,
        inviter_axis_id: inviterAxisId,
        invitee_axis_id: inviteeAxisId,
        inviter_display_name:
          (inviterProfile as { full_name?: string | null }).full_name?.trim() ||
          (inviterProfile as { email?: string | null }).email ||
          null,
        invitee_display_name:
          (inviteeProfile as { full_name?: string | null }).full_name?.trim() ||
          (inviteeProfile as { email?: string | null }).email ||
          null,
        assigned_property_ids: assignedPropertyIds,
        payout_percent_for_manager: payoutPercentForManager,
        status: "pending",
      })
      .select(
        [
          "id",
          "inviter_user_id",
          "invitee_user_id",
          "tab_kind",
          "inviter_axis_id",
          "invitee_axis_id",
          "inviter_display_name",
          "invitee_display_name",
          "assigned_property_ids",
          "payout_percent_for_manager",
          "status",
          "created_at",
          "responded_at",
        ].join(","),
      )
      .maybeSingle();

    if (insertErr) {
      if (looksLikeAccountLinksMissingTable(insertErr)) {
        return NextResponse.json(
          {
            error:
              "Database is missing account_link_invites. Apply supabase/migrations/20260422120000_account_link_invites.sql.",
            migrationRequired: true,
          },
          { status: 503 },
        );
      }
      const msg = insertErr.message ?? "";
      if (msg.includes("account_link_invites_unique_pending") || msg.includes("duplicate")) {
        return NextResponse.json({ error: "You already have a pending invite for this workspace on this tab." }, { status: 409 });
      }
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    const row = insertRow as InviteRow | null;
    if (!row?.id) {
      return NextResponse.json({ error: "Failed to create invite." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, invite: serializeInvite(row, user.id) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
