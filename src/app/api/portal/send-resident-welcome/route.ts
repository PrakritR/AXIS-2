import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { ensureResidentSetupTokenForApplication } from "@/lib/auth/resident-setup-token";
import { shouldSkipOutboundEmail } from "@/lib/portal-sandbox-accounts";
import {
  RESIDENT_WELCOME_EMAIL_SUBJECT,
  buildResidentWelcomeEmailBody,
  buildResidentWelcomeEmailHtml,
  buildResidentWelcomeMailtoHref,
  residentAccountCreationUrl,
} from "@/lib/resident-welcome-email";
import { sendResidentPropLaneAssistantIntro } from "@/lib/claw-onboarding-sms.server";
import { canSendResidentOutboundSms } from "@/lib/resident-outbound-sms.server";

export const runtime = "nodejs";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function canSendResidentWelcome(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "owner" || role === "pro";
}

// Domain is matched as dot-separated labels (no char class overlaps the "." delimiter)
// so there is exactly one way to parse a match — avoids polynomial backtracking on
// attacker-controlled input.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    let body: { to?: unknown; residentName?: unknown; axisId?: unknown };
    try {
      body = (await req.json()) as { to?: unknown; residentName?: unknown; axisId?: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const to = normalizeEmail(body.to);
    const residentName = typeof body.residentName === "string" ? body.residentName.trim() : "";
    const axisId = typeof body.axisId === "string" ? body.axisId.trim() : "";

    if (!to || !EMAIL_RE.test(to)) {
      return NextResponse.json({ error: "A valid recipient email is required." }, { status: 400 });
    }
    if (!axisId) {
      return NextResponse.json({ error: "PropLane ID is required." }, { status: 400 });
    }

    const senderEmail = normalizeEmail(user.email);
    const skipExternalEmail = shouldSkipOutboundEmail(to) || (senderEmail && to === senderEmail);

    const svc = createSupabaseServiceRoleClient();
    const { data: requestor, error: requestorError } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (requestorError || !requestor) {
      return NextResponse.json({ error: requestorError?.message ?? "Profile not found." }, { status: 403 });
    }

    if (!canSendResidentWelcome(requestor.role)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    // Scope the (token-rotating) lookup to the caller's own applications so a
    // manager can't rotate another manager's applicant's setup token by id.
    // Admins are internal staff (not self-serve) and keep cross-tenant reach.
    const scopeManagerId = requestor.role === "admin" ? undefined : user.id;
    const ensured = await ensureResidentSetupTokenForApplication(svc, axisId, {
      managerUserId: scopeManagerId,
    });
    if (!ensured.ok) {
      return NextResponse.json({ error: ensured.error }, { status: 400 });
    }
    if (ensured.email !== to) {
      return NextResponse.json(
        { error: "Recipient email does not match the application on file." },
        { status: 403 },
      );
    }

    const signupUrl = residentAccountCreationUrl("", ensured.axisId, ensured.token);
    const text = buildResidentWelcomeEmailBody({
      residentName: residentName || undefined,
      axisId: ensured.axisId,
      signupUrl,
    });
    const html = buildResidentWelcomeEmailHtml({
      residentName: residentName || undefined,
      axisId: ensured.axisId,
      signupUrl,
    });
    const mailtoHref = buildResidentWelcomeMailtoHref({
      residentEmail: to,
      residentName: residentName || undefined,
      axisId: ensured.axisId,
      origin: "",
      setupToken: ensured.token,
    });

    let payloadId: string | null = null;
    if (!skipExternalEmail) {
      const apiKey = process.env.RESEND_API_KEY?.trim();
      if (!apiKey) {
        return NextResponse.json(
          {
            ok: false,
            error: "Email delivery is not configured (set RESEND_API_KEY).",
            mailtoHref,
          },
          { status: 503 },
        );
      }

      const from = process.env.RESEND_FROM?.trim() || "PropLane <onboarding@resend.dev>";

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: RESIDENT_WELCOME_EMAIL_SUBJECT,
          text,
          html,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as { message?: string; id?: string; name?: string };
      if (!res.ok) {
        const msg = payload.message ?? res.statusText ?? "Resend request failed.";
        return NextResponse.json(
          {
            ok: false,
            error: msg,
            mailtoHref,
          },
          { status: 502 },
        );
      }
      payloadId = payload.id ?? null;
    }

    // Deliver to portal inboxes: manager's Sent + resident's Unopened
    try {
      const when = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 6);
      const senderName = user.email ?? "PropLane";
      const senderLower = normalizeEmail(user.email) || "manager@example.com";
      const preview = text.slice(0, 100).replace(/\n/g, " ");

      // Manager's Sent record (no participant_email so the resident doesn't get this copy)
      const managerThreadId = `welcome_${user.id}_${ts}_${rand}`;
      await svc.from("portal_inbox_thread_records").upsert(
        {
          id: managerThreadId,
          scope: "axis_portal_inbox_manager_v1",
          owner_user_id: user.id,
          participant_email: null,
          thread_type: "portal_message",
          row_data: {
            id: managerThreadId,
            folder: "sent",
            from: senderName,
            email: to,
            subject: RESIDENT_WELCOME_EMAIL_SUBJECT,
            preview,
            body: text,
            time: when,
            unread: false,
            scope: "axis_portal_inbox_manager_v1",
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      // Resident's Unopened record (skip self-send and @axis.local to avoid polluting inboxes)
      if (!skipExternalEmail && to.toLowerCase() !== senderLower) {
        const residentThreadId = `welcome_inbox_${ts}_${rand}`;
        await svc.from("portal_inbox_thread_records").upsert(
          {
            id: residentThreadId,
            scope: "axis_portal_inbox_resident_v1",
            owner_user_id: null,
            participant_email: to,
            thread_type: "portal_message",
            row_data: {
              id: residentThreadId,
              folder: "inbox",
              from: senderName,
              email: senderLower,
              subject: RESIDENT_WELCOME_EMAIL_SUBJECT,
              preview,
              body: text,
              time: when,
              unread: true,
              scope: "axis_portal_inbox_resident_v1",
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
      }
    } catch {
      /* non-critical — email already sent */
    }

    // SMS welcome: PropLane messaging assistant intro (idempotent per resident user).
    try {
      const { data: managerProfile } = await svc.from("profiles").select("sms_from_number, full_name").eq("id", user.id).maybeSingle();
      const smsFromNumber = String(managerProfile?.sms_from_number ?? "").trim();
      if (canSendResidentOutboundSms(smsFromNumber) && !skipExternalEmail) {
        const { data: residentProfile } = await svc
          .from("profiles")
          .select("id, phone, full_name")
          .eq("email", to)
          .maybeSingle();
        const residentPhone = String(residentProfile?.phone ?? "").trim();
        const residentUserId = String(residentProfile?.id ?? "").trim();
        if (residentPhone && residentUserId) {
          await sendResidentPropLaneAssistantIntro({
            db: svc,
            toPhone: residentPhone,
            residentUserId,
            residentEmail: to,
            managerUserId: user.id,
            name: residentName || String(residentProfile?.full_name ?? "").trim() || null,
            axisId,
            fromNumber: smsFromNumber,
          });
        }
      }
    } catch { /* non-critical */ }

    return NextResponse.json({ ok: true, id: payloadId, skipped: skipExternalEmail });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send welcome email." },
      { status: 500 },
    );
  }
}
