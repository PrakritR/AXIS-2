import { NextResponse } from "next/server";
import { asStringArray, serializeInvite, type InviteRow } from "@/app/api/pro/account-links/route";
import { looksLikeAccountLinksMissingTable } from "@/lib/account-links";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: Promise<{ inviteId: string }> }) {
  try {
    const { inviteId } = await ctx.params;
    const id = inviteId?.trim() ?? "";
    if (!id) {
      return NextResponse.json({ error: "inviteId is required." }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as {
      action?: string;
      assignedPropertyIds?: unknown;
      payoutPercentForManager?: number;
    } | null;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const svc = createSupabaseServiceRoleClient();

    const { data: row, error: fetchErr } = await svc.from("account_link_invites").select("*").eq("id", id).maybeSingle();

    if (fetchErr) {
      if (looksLikeAccountLinksMissingTable(fetchErr)) {
        return NextResponse.json(
          {
            error:
              "Database is missing account_link_invites. Apply supabase/migrations/20260422120000_account_link_invites.sql.",
            migrationRequired: true,
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const invite = row as InviteRow | null;
    if (!invite?.id) {
      return NextResponse.json({ error: "Invite not found." }, { status: 404 });
    }

    const actionNorm = body?.action != null ? String(body.action).toLowerCase().trim() : "";
    const patchProps = body?.assignedPropertyIds !== undefined;
    const patchPay = body?.payoutPercentForManager !== undefined;

    if (!actionNorm && !patchProps && !patchPay) {
      return NextResponse.json({ error: "Provide action or fields to update." }, { status: 400 });
    }

    if (actionNorm === "revoke") {
      if (invite.status !== "accepted") {
        return NextResponse.json({ error: "Only an active link can be revoked." }, { status: 409 });
      }
      if (invite.inviter_user_id !== user.id && invite.invitee_user_id !== user.id) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      const { data: updated, error: upErr } = await svc
        .from("account_link_invites")
        .update({ status: "cancelled", responded_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "accepted")
        .select("*")
        .maybeSingle();

      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, invite: serializeInvite(updated as InviteRow, user.id) });
    }

    /** After accept: both workspaces can edit split and property scope. */
    if (!actionNorm && (patchProps || patchPay)) {
      if (invite.status !== "accepted") {
        return NextResponse.json({ error: "Only accepted links can be updated this way." }, { status: 409 });
      }
      if (invite.inviter_user_id !== user.id && invite.invitee_user_id !== user.id) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }

      const nextAssigned = patchProps ? asStringArray(body?.assignedPropertyIds) : asStringArray(invite.assigned_property_ids);
      if (patchProps && nextAssigned.length === 0) {
        return NextResponse.json({ error: "Keep at least one property in this link." }, { status: 400 });
      }

      const nextPayout = patchPay
        ? Math.min(100, Math.max(0, Math.round(Number(body?.payoutPercentForManager) * 10) / 10))
        : Number(invite.payout_percent_for_manager);

      const { data: updated, error: upErr } = await svc
        .from("account_link_invites")
        .update({
          assigned_property_ids: nextAssigned,
          payout_percent_for_manager: nextPayout,
        })
        .eq("id", id)
        .eq("status", "accepted")
        .select("*")
        .maybeSingle();

      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, invite: serializeInvite(updated as InviteRow, user.id) });
    }

    if (actionNorm !== "accept" && actionNorm !== "reject" && actionNorm !== "cancel") {
      return NextResponse.json({ error: "action must be accept, reject, or cancel." }, { status: 400 });
    }

    if (invite.status !== "pending") {
      return NextResponse.json({ error: "This invite is no longer pending." }, { status: 409 });
    }

    if (actionNorm === "cancel") {
      if (invite.inviter_user_id !== user.id) {
        return NextResponse.json({ error: "Only the inviter can cancel." }, { status: 403 });
      }
      const { data: updated, error: upErr } = await svc
        .from("account_link_invites")
        .update({ status: "cancelled", responded_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();

      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, invite: serializeInvite(updated as InviteRow, user.id) });
    }

    if (invite.invitee_user_id !== user.id) {
      return NextResponse.json({ error: "Only the invitee can accept or reject." }, { status: 403 });
    }

    const nextStatus = actionNorm === "accept" ? "accepted" : "rejected";
    const { data: updated, error: upErr } = await svc
      .from("account_link_invites")
      .update({ status: nextStatus, responded_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, invite: serializeInvite(updated as InviteRow, user.id) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
