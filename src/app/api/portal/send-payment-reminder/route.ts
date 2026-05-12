import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      residentEmail?: string;
      residentName?: string;
      chargeTitle?: string;
      balanceDue?: string;
      propertyLabel?: string;
      managerName?: string;
    };

    const residentEmail = String(body.residentEmail ?? "").trim();
    const residentName = String(body.residentName ?? "Resident").trim();
    const chargeTitle = String(body.chargeTitle ?? "outstanding charge").trim();
    const balanceDue = String(body.balanceDue ?? "").trim();
    const propertyLabel = String(body.propertyLabel ?? "").trim();
    const managerName = String(body.managerName ?? "Your property manager").trim();

    if (!residentEmail || !residentEmail.includes("@")) {
      return NextResponse.json({ ok: false, error: "Valid resident email required." }, { status: 400 });
    }

    if (residentEmail.endsWith("@axis.local")) {
      // Demo email — still deliver to portal inbox, just skip real email
      await deliverToPortalInbox({ db: createSupabaseServiceRoleClient(), userId: user.id, managerEmail: user.email ?? "", residentEmail, residentName, chargeTitle, balanceDue, propertyLabel, managerName });
      return NextResponse.json({ ok: true, skipped: true, reason: "Demo email — no real delivery, portal inbox updated." });
    }

    const subject = `Payment reminder: ${chargeTitle}`;
    const messageBody = buildReminderBody({ residentName, chargeTitle, balanceDue, propertyLabel, managerName });

    // 1. Send real email via Resend
    let emailSent = false;
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (apiKey) {
      const from = process.env.RESEND_FROM?.trim() || "Axis Housing <onboarding@resend.dev>";
      const html = `<p style="white-space:pre-wrap;font-family:sans-serif;font-size:15px;line-height:1.6;color:#1e293b">${messageBody.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p><hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0"><p style="font-family:sans-serif;font-size:12px;color:#94a3b8">Sent via Axis Housing portal by ${managerName}</p>`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [residentEmail], subject, text: messageBody, html }),
      });
      emailSent = res.ok;
    }

    const db = createSupabaseServiceRoleClient();

    // 2. Deliver to resident's Axis portal inbox
    await deliverToPortalInbox({ db, userId: user.id, managerEmail: user.email ?? "", residentEmail, residentName, chargeTitle, balanceDue, propertyLabel, managerName });

    // 3. Log to outbound mail records
    const outboundId = `outbound_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.from("portal_outbound_mail_records").upsert({
      id: outboundId,
      recipient_email: residentEmail.toLowerCase(),
      subject,
      row_data: { id: outboundId, to: residentEmail, subject, body: messageBody, sentAt: new Date().toISOString(), emailSent },
    }, { onConflict: "id" });

    return NextResponse.json({ ok: true, emailSent });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

function buildReminderBody({
  residentName,
  chargeTitle,
  balanceDue,
  propertyLabel,
  managerName,
}: {
  residentName: string;
  chargeTitle: string;
  balanceDue: string;
  propertyLabel: string;
  managerName: string;
}): string {
  const lines = [
    `Hi ${residentName},`,
    "",
    `This is a friendly reminder that your ${chargeTitle} payment is outstanding.`,
  ];
  if (balanceDue) lines.push(`Amount due: ${balanceDue}`);
  if (propertyLabel) lines.push(`Property: ${propertyLabel}`);
  lines.push(
    "",
    "Please log in to your Axis resident portal to make your payment at your earliest convenience.",
    "",
    "If you have any questions, please don't hesitate to reach out.",
    "",
    managerName,
    "Axis Housing Portal",
  );
  return lines.join("\n");
}

async function deliverToPortalInbox({
  db,
  userId,
  managerEmail,
  residentEmail,
  residentName,
  chargeTitle,
  balanceDue,
  propertyLabel,
  managerName,
}: {
  db: ReturnType<typeof createSupabaseServiceRoleClient>;
  userId: string;
  managerEmail: string;
  residentEmail: string;
  residentName: string;
  chargeTitle: string;
  balanceDue: string;
  propertyLabel: string;
  managerName: string;
}) {
  const subject = `Payment reminder: ${chargeTitle}`;
  const messageBody = buildReminderBody({ residentName, chargeTitle, balanceDue, propertyLabel, managerName });
  const threadId = `reminder_${userId}_${Date.now()}`;
  const when = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const thread = {
    id: threadId,
    folder: "inbox",
    from: managerName,
    email: managerEmail || "manager@example.com",
    subject,
    preview: messageBody.slice(0, 100).replace(/\n/g, " "),
    body: messageBody,
    time: when,
    unread: true,
    scope: "axis_portal_inbox_resident_v1",
  };
  await db.from("portal_inbox_thread_records").upsert(
    {
      id: threadId,
      scope: "axis_portal_inbox_resident_v1",
      owner_user_id: userId,
      participant_email: residentEmail.toLowerCase(),
      thread_type: "payment_reminder",
      row_data: thread,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}
