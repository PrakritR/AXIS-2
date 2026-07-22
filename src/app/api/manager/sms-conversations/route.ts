import { NextResponse } from "next/server";
import {
  deleteManagerSmsConversation,
  fetchManagerSmsConversations,
  resolveSmsScopeManagerIds,
} from "@/lib/manager-sms-messages.server";
import { sendFromManagerWorkNumber } from "@/lib/proplane-sms-transport.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { normalizeE164 } from "@/lib/twilio";
import { resolveManagerWorkNumber } from "@/lib/twilio-provisioning";

export const runtime = "nodejs";

async function requireManager() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  const db = createSupabaseServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role, sms_from_number").eq("id", user.id).maybeSingle();
  const role = String(profile?.role ?? "").trim().toLowerCase();
  if (role !== "manager" && role !== "pro" && role !== "owner") {
    return { error: NextResponse.json({ error: "Manager access required." }, { status: 403 }) };
  }
  return { user, db, profile };
}

/** Manager Communication → SMS: work number + per-resident inbound/outbound texts. */
export async function GET() {
  const auth = await requireManager();
  if ("error" in auth) return auth.error;

  try {
    const payload = await fetchManagerSmsConversations(auth.db, auth.user.id);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load SMS conversations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Delete a conversation (all stored texts) for one phone number. */
export async function DELETE(req: Request) {
  const auth = await requireManager();
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as { phone?: string };
  const phone = normalizeE164(String(body.phone ?? "").trim());
  if (!phone) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });

  const conversations = await fetchManagerSmsConversations(auth.db, auth.user.id);
  const digits = phone.replace(/\D/g, "");
  const match = conversations.residents.find((r) => {
    const phoneDigits = String(r.phone ?? "").replace(/\D/g, "");
    return Boolean(phoneDigits && (phoneDigits === digits || phoneDigits.endsWith(digits.slice(-10))));
  });
  if (!match) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const ownerManagerUserId = String(match.ownerManagerUserId ?? auth.user.id).trim() || auth.user.id;
  // Deleting an owner's conversation needs an edit-level inbox grant —
  // read-level co-manager access only allows viewing.
  if (ownerManagerUserId !== auth.user.id) {
    const editScope = await resolveSmsScopeManagerIds(auth.db, auth.user.id, "edit");
    if (!editScope.includes(ownerManagerUserId)) {
      return NextResponse.json({ error: "You do not have edit access to this conversation." }, { status: 403 });
    }
  }

  const result = await deleteManagerSmsConversation(auth.db, {
    managerUserId: ownerManagerUserId,
    phone,
  });
  if (!result.ok) {
    return NextResponse.json({ error: "Could not delete conversation." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted: result.deleted });
}

/** Send a new SMS from the PropLane messaging number (Claw agent line). */
export async function POST(req: Request) {
  const auth = await requireManager();
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as {
    toPhone?: string;
    text?: string;
    residentUserId?: string | null;
  };
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Enter a message." }, { status: 400 });
  if (text.length > 1600) {
    return NextResponse.json({ error: "Message is too long (max 1600 characters)." }, { status: 400 });
  }

  const toPhone = normalizeE164(String(body.toPhone ?? "").trim());
  if (!toPhone) return NextResponse.json({ error: "Enter a valid US phone number." }, { status: 400 });

  const conversations = await fetchManagerSmsConversations(auth.db, auth.user.id);
  const toDigits = toPhone.replace(/\D/g, "");
  const match = conversations.residents.find((r) => {
    const phoneDigits = String(r.phone ?? "").replace(/\D/g, "");
    if (phoneDigits && (phoneDigits === toDigits || phoneDigits.endsWith(toDigits.slice(-10)))) return true;
    if (body.residentUserId && r.residentUserId === body.residentUserId) return true;
    return false;
  });

  // Directory match is preferred for co-manager owner resolution; cold outreach
  // to any E.164 (Other chip / new prospect) is allowed and logs a new thread.
  const ownerManagerUserId = String(match?.ownerManagerUserId ?? auth.user.id).trim() || auth.user.id;
  if (ownerManagerUserId !== auth.user.id) {
    const editScope = await resolveSmsScopeManagerIds(auth.db, auth.user.id, "edit");
    if (!editScope.includes(ownerManagerUserId)) {
      return NextResponse.json({ error: "You do not have edit access to this conversation." }, { status: 403 });
    }
  }
  const workNumber = await resolveManagerWorkNumber(auth.db, ownerManagerUserId);
  if (!workNumber) {
    return NextResponse.json(
      { error: "No work number on this account yet. Open View number or finish SMS setup first." },
      { status: 400 },
    );
  }

  const result = await sendFromManagerWorkNumber({
    managerUserId: ownerManagerUserId,
    to: toPhone,
    text,
    fromNumber: workNumber,
    residentUserId: match?.residentUserId ?? body.residentUserId ?? null,
    source: "work_number",
    // Thread the reply into the SAME conversation the manager is looking at
    // (a prospect stays a prospect, a resident a resident).
    counterpartyRole: match?.counterpartyRole,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error === "recipient_opted_out" ? "That number has opted out of texts." : "Could not send SMS." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    channel: result.channel,
    sid: result.sid,
  });
}
