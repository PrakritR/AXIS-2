import { NextResponse } from "next/server";
import {
  APPLICATION_COMPLETION_REMINDER_SUBJECT,
  buildApplicationCompletionReminderBody,
  buildApplicationCompletionReminderHtml,
  buildApplicationCompletionReminderMailtoHref,
} from "@/lib/application-completion-reminder-email";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { applicationVisibleToPortalUser } from "@/lib/manager-portfolio-access";
import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";
import {
  inProgressApplicationResumeUrl,
  isInProgressApplicationRow,
} from "@/lib/rental-application/in-progress-application";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { resolveEmailLinkBaseUrl } from "@/lib/app-url";
import { track } from "@/lib/analytics/posthog";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

function idVariants(id: string): string[] {
  const trimmed = id.trim();
  const normalized = normalizeApplicationAxisId(trimmed);
  return [...new Set([trimmed, normalized].filter(Boolean))];
}

// Emails link to the canonical domain only — never a *.vercel.app deploy URL.
function appOrigin(): string {
  return resolveEmailLinkBaseUrl();
}

function canSendApplicationReminder(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "pro";
}

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    let body: { applicationId?: unknown; preview?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const applicationId = typeof body.applicationId === "string" ? body.applicationId.trim() : "";
    if (!applicationId) return NextResponse.json({ error: "applicationId is required." }, { status: 400 });
    // Preview mode returns exactly what would be sent (same auth, recipient, and copy)
    // so the manager can confirm before a real email goes out — nothing is sent.
    const previewOnly = body.preview === true;

    const svc = createSupabaseServiceRoleClient();
    const { data: requestor, error: requestorError } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (requestorError) return NextResponse.json({ error: requestorError.message }, { status: 500 });
    const admin = await isAdminUser(user.id);
    if (!admin && !canSendApplicationReminder(requestor?.role)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    const { data: records, error } = await svc
      .from("manager_application_records")
      .select("id, row_data, resident_email")
      .in("id", idVariants(applicationId));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const record = (records ?? []).find((r) => idVariants(applicationId).includes(r.id));
    if (!record?.row_data) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    const row = record.row_data as DemoApplicantRow;
    if (!isInProgressApplicationRow(row)) {
      return NextResponse.json({ error: "Only in-progress applications can receive a completion reminder." }, { status: 400 });
    }

    if (!admin && !applicationVisibleToPortalUser(row, user.id)) {
      return NextResponse.json({ error: "You do not manage this application." }, { status: 403 });
    }

    const email = (row.email?.trim() || record.resident_email?.trim() || "").toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "This application has no valid applicant email on file." }, { status: 400 });
    }

    const origin = appOrigin();
    const resumeUrl = inProgressApplicationResumeUrl(origin, row);
    const signInUrl = `${origin}/auth/sign-in?role=resident`;
    const text = buildApplicationCompletionReminderBody({
      applicantName: row.name || undefined,
      propertyTitle: row.property || undefined,
      resumeUrl,
      signInUrl,
    });
    const html = buildApplicationCompletionReminderHtml({
      applicantName: row.name || undefined,
      propertyTitle: row.property || undefined,
      resumeUrl,
      signInUrl,
    });
    const mailtoHref = buildApplicationCompletionReminderMailtoHref({
      to: email,
      applicantName: row.name || undefined,
      propertyTitle: row.property || undefined,
      resumeUrl,
      signInUrl,
    });

    if (previewOnly) {
      return NextResponse.json({
        ok: true,
        preview: { to: email, subject: APPLICATION_COMPLETION_REMINDER_SUBJECT, text },
      });
    }

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Email delivery is not configured.", mailtoHref }, { status: 503 });
    }

    const from = process.env.RESEND_FROM?.trim() || "PropLane <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email], subject: APPLICATION_COMPLETION_REMINDER_SUBJECT, text, html }),
    });
    const payload = (await res.json().catch(() => ({}))) as { message?: string; id?: string };
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: payload.message ?? res.statusText, mailtoHref }, { status: 502 });
    }
    // Server-confirmed outcome: the manager successfully nudged an in-progress applicant.
    track("application_completion_reminder_sent", user.id, { has_property: Boolean(row.propertyId) });
    return NextResponse.json({ ok: true, id: payload.id ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send reminder." },
      { status: 500 },
    );
  }
}
