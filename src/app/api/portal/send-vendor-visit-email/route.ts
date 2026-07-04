import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { deliverPortalInboxMessage } from "@/lib/portal-inbox-delivery";
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

    const db = createSupabaseServiceRoleClient();
    const admin = await isAdminUser(user.id);
    const { data: profile } = await db.from("profiles").select("role, email, full_name").eq("id", user.id).maybeSingle();
    const role = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
    if (!admin && role !== "manager" && role !== "pro") {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      workOrderId?: string;
      vendorId?: string;
      vendorEmail?: string;
      vendorName?: string;
      workOrderTitle?: string;
      propertyLabel?: string;
      unit?: string;
      visitLabel?: string;
      description?: string;
      preferredArrival?: string;
    };

    const workOrderId = String(body.workOrderId ?? "").trim();
    if (!workOrderId) {
      return NextResponse.json({ ok: false, error: "Work order id required." }, { status: 400 });
    }
    if (!admin) {
      const { data: workOrder } = await db
        .from("portal_work_order_records")
        .select("manager_user_id")
        .eq("id", workOrderId)
        .maybeSingle();
      if (!workOrder || workOrder.manager_user_id !== user.id) {
        return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
      }
    }

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

    const outboundId = `outbound_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { error: auditError } = await db.from("portal_outbound_mail_records").upsert(
      {
        id: outboundId,
        recipient_email: vendorEmail,
        subject,
        channel: "email",
        row_data: { id: outboundId, to: vendorEmail, subject, body: messageBody, sentAt: new Date().toISOString(), emailSent },
      },
      { onConflict: "id" },
    );
    if (auditError) {
      console.error("send-vendor-visit-email: audit log write failed", auditError);
    }

    // Also deliver an Axis inbox message once the vendor has signed up and linked
    // their auth user — the email above reaches them regardless of signup status,
    // but the inbox thread only makes sense once there's a vendor account to own it.
    let inboxDelivered = false;
    const vendorId = String(body.vendorId ?? "").trim();
    if (vendorId) {
      const { data: vendorRow } = await db
        .from("manager_vendor_records")
        .select("vendor_user_id")
        .eq("id", vendorId)
        .maybeSingle();
      const vendorUserId = (vendorRow?.vendor_user_id as string | null) ?? null;
      if (vendorUserId) {
        const delivery = await deliverPortalInboxMessage(db, {
          senderUserId: user.id,
          senderEmail: (profile?.email ?? user.email ?? "").trim().toLowerCase(),
          fromName: profile?.full_name?.trim() || "Axis Portal",
          subject,
          text: messageBody,
          toUserIds: [vendorUserId],
          deliverToPortalInbox: true,
          deliverViaEmail: false,
          deliverViaSms: false,
        });
        inboxDelivered = delivery.ok;
      }
    }

    track("work_order_vendor_email_sent", user.id, { email_sent: emailSent, inbox_delivered: inboxDelivered });
    return NextResponse.json({ ok: true, emailSent, inboxDelivered, skipped: skipExternalEmail });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
