import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function normalizeEmails(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[;,]/).map((e) => e.trim()).filter(Boolean);
  return [];
}

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      fromName?: string;
      fromEmail?: string;
      toEmails?: unknown;
      subject?: string;
      text?: string;
      deliverToPortalInbox?: boolean;
    };

    const senderEmail = String(user.email ?? body.fromEmail ?? "portal@example.com").trim().toLowerCase();
    const allEmails = normalizeEmails(body.toEmails)
      .filter((e) => e.includes("@"))
      .map((e) => e.trim().toLowerCase())
      .filter((email, index, arr) => arr.indexOf(email) === index);
    const recipientEmails = allEmails.filter((email) => email !== senderEmail);
    const toEmails = recipientEmails.filter((e) => !e.endsWith("@axis.local"));
    const subject = String(body.subject ?? "").trim();
    const text = String(body.text ?? "").trim();
    const fromName = String(body.fromName ?? "Axis Housing Portal").trim();
    const deliverToPortalInbox = body.deliverToPortalInbox !== false;

    if (!subject || !text) {
      return NextResponse.json({ ok: false, error: "subject and text are required." }, { status: 400 });
    }

    const db = createSupabaseServiceRoleClient();
    // Deliver to portal inbox for all recipients (including @axis.local demo emails)
    if (deliverToPortalInbox && recipientEmails.length > 0) {
      const { data: senderProfile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
      const senderRole = String(senderProfile?.role ?? "").toLowerCase();
      const senderScope = senderRole === "owner"
        ? "axis_portal_inbox_owner_v1"
        : "axis_portal_inbox_manager_v1";

      const when = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      const preview = text.slice(0, 100).replace(/\n/g, " ");
      for (const recipientEmail of recipientEmails) {
        const ts = Date.now();
        const rand = Math.random().toString(36).slice(2, 6);
        const recipientLower = recipientEmail;

        // Sender's Sent record (owner-only, scoped to the sender's portal)
        const managerThreadId = `msg_${user.id}_${ts}_${rand}`;
        await db.from("portal_inbox_thread_records").upsert(
          {
            id: managerThreadId,
            scope: senderScope,
            owner_user_id: user.id,
            participant_email: null,
            thread_type: "portal_message",
            row_data: { id: managerThreadId, folder: "sent", from: fromName, email: recipientLower, subject, preview, body: text, time: when, unread: false, scope: senderScope },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );

        // Resident's Unopened record
        const residentThreadId = `msg_inbox_${ts}_${rand}`;
        await db.from("portal_inbox_thread_records").upsert(
          {
            id: residentThreadId,
            scope: "axis_portal_inbox_resident_v1",
            owner_user_id: null,
            participant_email: recipientLower,
            thread_type: "portal_message",
            row_data: { id: residentThreadId, folder: "inbox", from: fromName, email: senderEmail, subject, preview, body: text, time: when, unread: true, scope: "axis_portal_inbox_resident_v1" },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
      }
    }

    if (toEmails.length === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: "No eligible real recipients — portal inbox updated." });
    }

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Email delivery not configured (RESEND_API_KEY missing)." }, { status: 503 });
    }

    const from = process.env.RESEND_FROM?.trim() || "Axis Housing <onboarding@resend.dev>";
    const html = `<p style="white-space:pre-wrap;font-family:sans-serif;font-size:15px;line-height:1.6;color:#1e293b">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p><hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0"><p style="font-family:sans-serif;font-size:12px;color:#94a3b8">Sent via Axis Housing portal by ${fromName}</p>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: toEmails, subject, text, html }),
    });

    const payload = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: payload.message ?? "Email send failed." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, id: payload.id ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
