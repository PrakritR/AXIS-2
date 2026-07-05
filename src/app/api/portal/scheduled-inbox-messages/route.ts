import { NextResponse } from "next/server";
import {
  createScheduledInboxMessage,
  generateScheduledInboxMessageId,
  loadScheduledInboxMessagesForManager,
} from "@/lib/scheduled-inbox-messages";
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

export async function GET() {
  try {
    const ctx = await requireManager();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const messages = await loadScheduledInboxMessagesForManager(ctx.db, ctx.userId);
    return NextResponse.json({ messages });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireManager();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = (await req.json()) as {
      subject?: string;
      body?: string;
      sendAt?: string;
      recipientEmail?: string;
      recipientName?: string;
      recipientUserId?: string;
      broadcastCategories?: unknown;
      deliverViaEmail?: boolean;
      deliverViaSms?: boolean;
    };

    const subject = String(body.subject ?? "").trim();
    const messageBody = String(body.body ?? "").trim();
    const sendAtRaw = String(body.sendAt ?? "").trim();
    const broadcastCategories = (Array.isArray(body.broadcastCategories) ? body.broadcastCategories : []).filter(
      (c): c is "management" | "resident" => c === "management" || c === "resident",
    );
    const recipientEmail = String(body.recipientEmail ?? "").trim().toLowerCase();
    const recipientName = String(body.recipientName ?? "").trim();
    let recipientUserId = String(body.recipientUserId ?? "").trim() || null;
    if (recipientEmail && !broadcastCategories.length) {
      const { data: profile } = await ctx.db.from("profiles").select("id").ilike("email", recipientEmail).maybeSingle();
      recipientUserId = profile?.id ?? null;
    }

    if (!subject || !messageBody) {
      return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
    }
    if (!sendAtRaw) {
      return NextResponse.json({ error: "Send date and time are required." }, { status: 400 });
    }
    const sendAt = new Date(sendAtRaw);
    if (Number.isNaN(sendAt.getTime())) {
      return NextResponse.json({ error: "Invalid send date." }, { status: 400 });
    }
    if (sendAt.getTime() < Date.now() - 60_000) {
      return NextResponse.json({ error: "Send time must be in the future." }, { status: 400 });
    }
    if (!broadcastCategories.length && (!recipientEmail || !recipientEmail.includes("@"))) {
      return NextResponse.json({ error: "Choose a recipient or a broadcast group." }, { status: 400 });
    }

    const record = await createScheduledInboxMessage(ctx.db, {
      id: generateScheduledInboxMessageId(),
      managerUserId: ctx.userId,
      sendAt: sendAt.toISOString(),
      status: "scheduled",
      subject,
      body: messageBody,
      recipientEmail: broadcastCategories.length ? broadcastCategories.join("+") : recipientEmail,
      recipientName: broadcastCategories.length
        ? broadcastCategories.includes("resident")
          ? "All residents"
          : "All management"
        : recipientName || recipientEmail,
      recipientUserId,
      broadcastCategories: broadcastCategories.length ? broadcastCategories : undefined,
      deliverViaEmail: body.deliverViaEmail !== false,
      deliverViaSms: body.deliverViaSms === true,
    });

    return NextResponse.json({ ok: true, message: record });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
