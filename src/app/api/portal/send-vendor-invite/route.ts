import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import { resolveAppOrigin } from "@/lib/app-url";
import { generateVendorInviteToken } from "@/lib/auth/provision-vendor-account";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import {
  buildVendorInviteEmailBody,
  buildVendorInviteEmailHtml,
  buildVendorInviteMailtoHref,
  vendorInviteSubject,
} from "@/lib/vendor-invite-email";

const VENDOR_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const runtime = "nodejs";

// Domain matched as dot-separated labels (no char-class overlap with the "." delimiter)
// so there is exactly one way to parse a match — avoids polynomial backtracking.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

function canSendVendorInvite(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "owner" || role === "pro";
}

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      vendorId?: string;
      vendorName?: string;
      vendorEmail?: string;
    };
    const vendorId = String(body.vendorId ?? "").trim();
    const vendorName = String(body.vendorName ?? "").trim();
    const vendorEmail = String(body.vendorEmail ?? "").trim().toLowerCase();

    if (!vendorId) return NextResponse.json({ error: "vendorId is required." }, { status: 400 });
    if (!vendorEmail || !EMAIL_RE.test(vendorEmail)) {
      return NextResponse.json({ error: "A valid vendor email is required." }, { status: 400 });
    }

    const db = createSupabaseServiceRoleClient();
    const { data: profile } = await db.from("profiles").select("role, full_name, email").eq("id", user.id).maybeSingle();
    if (!canSendVendorInvite(profile?.role)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    // Only the owning manager may invite for their own vendor directory row.
    const { data: vendorRow } = await db
      .from("manager_vendor_records")
      .select("id, manager_user_id")
      .eq("id", vendorId)
      .maybeSingle();
    if (!vendorRow || vendorRow.manager_user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    // One pending invite per vendor directory row — replace rather than pile up.
    await db.from("vendor_invites").delete().eq("vendor_directory_id", vendorId).eq("status", "pending");
    const inviteToken = generateVendorInviteToken();
    const expiresAt = new Date(Date.now() + VENDOR_INVITE_TTL_MS).toISOString();
    const { error: insertError } = await db.from("vendor_invites").insert({
      manager_user_id: user.id,
      vendor_directory_id: vendorId,
      vendor_email: vendorEmail,
      vendor_name: vendorName || null,
      invite_token: inviteToken,
      expires_at: expiresAt,
    });
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    // The link carries only the opaque token, never the email — the register route
    // resolves the invited email server-side from the token so a caller can't hijack
    // another vendor's pending invite by supplying an arbitrary email/pattern.
    const origin = resolveAppOrigin(req);
    const linkUrl = `${origin}/auth/vendor-register?token=${encodeURIComponent(inviteToken)}`;
    const managerName = profile?.full_name?.trim() || profile?.email?.trim() || "Your property manager";

    const subject = vendorInviteSubject(managerName);
    const text = buildVendorInviteEmailBody({ vendorName, managerName, linkUrl });
    const html = buildVendorInviteEmailHtml({ vendorName, managerName, linkUrl });
    const mailtoHref = buildVendorInviteMailtoHref({ to: vendorEmail, vendorName, managerName, linkUrl });

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Email delivery is not configured (set RESEND_API_KEY).", mailtoHref, linkUrl },
        { status: 503 },
      );
    }

    const from = process.env.RESEND_FROM?.trim() || "PropLane <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [vendorEmail], subject, text, html }),
    });
    const payload = (await res.json().catch(() => ({}))) as { message?: string; id?: string };
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: payload.message ?? res.statusText, mailtoHref, linkUrl }, { status: 502 });
    }

    track("vendor_invite_sent", user.id, { vendor_id: vendorId });
    return NextResponse.json({ ok: true, id: payload.id ?? null, linkUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to send invite." }, { status: 500 });
  }
}
