import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { buildVendorVisitEmail } from "@/lib/vendor-visit-email";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      vendorEmail?: string;
      vendorName?: string;
      workOrderTitle?: string;
      propertyLabel?: string;
      unit?: string;
      visitLabel?: string;
      description?: string;
      preferredArrival?: string;
    };

    const vendorEmail = String(body.vendorEmail ?? "").trim().toLowerCase();
    const vendorName = String(body.vendorName ?? "").trim();
    const workOrderTitle = String(body.workOrderTitle ?? "").trim();
    const propertyLabel = String(body.propertyLabel ?? "").trim();
    const unit = String(body.unit ?? "").trim();
    const visitLabel = String(body.visitLabel ?? "").trim();
    const description = String(body.description ?? "").trim();
    const preferredArrival = String(body.preferredArrival ?? "").trim();

    if (!vendorEmail.includes("@")) {
      return NextResponse.json({ ok: false, error: "Valid vendor email required." }, { status: 400 });
    }
    if (!workOrderTitle || !visitLabel) {
      return NextResponse.json({ ok: false, error: "Work order title and visit time required." }, { status: 400 });
    }

    const { subject, body: messageBody } = buildVendorVisitEmail({
      vendorName,
      workOrderTitle,
      propertyLabel,
      unit,
      visitLabel,
      description,
      preferredArrival,
    });

    // Demo vendor addresses stay internal — skip real delivery, still log below.
    const skipExternalEmail = vendorEmail.endsWith("@axis.local");

    let emailSent = false;
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!skipExternalEmail && apiKey) {
      const from = process.env.RESEND_FROM?.trim() || "Axis <onboarding@resend.dev>";
      const html = `<p style="white-space:pre-wrap;font-family:sans-serif;font-size:15px;line-height:1.6;color:#1e293b">${messageBody.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p><hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0"><p style="font-family:sans-serif;font-size:12px;color:#94a3b8">Sent via Axis portal</p>`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [vendorEmail], subject, text: messageBody, html }),
      });
      emailSent = res.ok;
    }

    const db = createSupabaseServiceRoleClient();
    const outboundId = `outbound_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.from("portal_outbound_mail_records").upsert(
      {
        id: outboundId,
        recipient_email: vendorEmail,
        subject,
        channel: "email",
        row_data: { id: outboundId, to: vendorEmail, subject, body: messageBody, sentAt: new Date().toISOString(), emailSent },
      },
      { onConflict: "id" },
    );

    track("work_order_vendor_email_sent", user.id, { email_sent: emailSent });
    return NextResponse.json({ ok: true, emailSent, skipped: skipExternalEmail });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
