import { NextResponse } from "next/server";
import { updateScheduledInboxMessage } from "@/lib/scheduled-inbox-messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

async function requireManager() {
  const supabaseAuth = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user?.id) return null;

  const db = createSupabaseServiceRoleClient();
  const [{ data: profile }, { data: roles }] = await Promise.all([
    db.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    db.from("profile_roles").select("role").eq("user_id", user.id),
  ]);
  const roleList = (roles ?? []).map((r) => String(r.role).toLowerCase());
  const legacy = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
  const isManager = roleList.includes("manager") || legacy === "manager" || legacy === "admin";
  if (!isManager) return null;
  return { db, userId: user.id };
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager();
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { id } = await ctx.params;
    const body = (await req.json()) as {
      cancelled?: boolean;
      subject?: string;
      body?: string;
      sendAt?: string;
      deliverViaEmail?: boolean;
    };

    if (body.cancelled === true) {
      await updateScheduledInboxMessage(auth.db, auth.userId, id, {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true });
    }
    if (body.cancelled === false) {
      await updateScheduledInboxMessage(auth.db, auth.userId, id, {
        status: "scheduled",
        cancelledAt: null,
      });
      return NextResponse.json({ ok: true });
    }

    const patch: Parameters<typeof updateScheduledInboxMessage>[3] = {};
    if (typeof body.subject === "string") patch.subject = body.subject.trim();
    if (typeof body.body === "string") patch.body = body.body.trim();
    if (typeof body.deliverViaEmail === "boolean") patch.deliverViaEmail = body.deliverViaEmail;
    if (typeof body.sendAt === "string" && body.sendAt.trim()) {
      const sendAt = new Date(body.sendAt);
      if (Number.isNaN(sendAt.getTime())) {
        return NextResponse.json({ error: "Invalid send date." }, { status: 400 });
      }
      patch.sendAt = sendAt.toISOString();
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No changes provided." }, { status: 400 });
    }

    await updateScheduledInboxMessage(auth.db, auth.userId, id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager();
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const { id } = await ctx.params;
    const { error } = await auth.db
      .from("portal_scheduled_inbox_message_records")
      .delete()
      .eq("id", id)
      .eq("manager_user_id", auth.userId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
