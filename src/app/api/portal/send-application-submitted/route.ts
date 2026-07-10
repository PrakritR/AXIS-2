import { NextResponse } from "next/server";
import {
  APPLICATION_SUBMITTED_EMAIL_SUBJECT,
  buildApplicationSubmittedEmailBody,
  buildApplicationSubmittedEmailHtml,
  buildApplicationSubmittedMailtoHref,
} from "@/lib/application-submitted-email";
import { ensureResidentSetupTokenForApplication } from "@/lib/auth/resident-setup-token";
import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";
import { residentAccountCreationUrl } from "@/lib/resident-welcome-email";
import { shouldSkipOutboundEmail } from "@/lib/portal-sandbox-accounts";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { resolveEmailLinkBaseUrl } from "@/lib/app-url";

export const runtime = "nodejs";

// Domain is matched as dot-separated labels (no char class overlaps the "." delimiter)
// so there is exactly one way to parse a match — avoids polynomial backtracking on
// attacker-controlled input.
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

export async function POST(req: Request) {
  try {
    let body: { email?: unknown; axisId?: unknown; applicantName?: unknown; propertyTitle?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const axisId = typeof body.axisId === "string" ? body.axisId.trim() : "";
    const applicantName = typeof body.applicantName === "string" ? body.applicantName.trim() : "";
    const propertyTitle = typeof body.propertyTitle === "string" ? body.propertyTitle.trim() : "";

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }
    if (!axisId) return NextResponse.json({ error: "axisId is required." }, { status: 400 });

    const db = createSupabaseServiceRoleClient();
    const { data: rows, error } = await db
      .from("manager_application_records")
      .select("id, resident_email, row_data")
      .in("id", idVariants(axisId));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const match = (rows ?? []).find((row) => (row.resident_email ?? "").trim().toLowerCase() === email);
    if (!match) {
      return NextResponse.json({ error: "Application not found for this email and ID." }, { status: 403 });
    }

    const ensured = await ensureResidentSetupTokenForApplication(db, match.id);
    if (!ensured.ok) {
      return NextResponse.json({ error: ensured.error }, { status: 500 });
    }

    const origin = appOrigin();
    const signupUrl = residentAccountCreationUrl(origin, ensured.axisId, ensured.token);
    const text = buildApplicationSubmittedEmailBody({
      applicantName: applicantName || undefined,
      applicantEmail: email,
      axisId: ensured.axisId,
      signupUrl,
      propertyTitle: propertyTitle || undefined,
    });
    const html = buildApplicationSubmittedEmailHtml({
      applicantName: applicantName || undefined,
      applicantEmail: email,
      axisId: ensured.axisId,
      signupUrl,
      propertyTitle: propertyTitle || undefined,
    });
    const mailtoHref = buildApplicationSubmittedMailtoHref({
      to: email,
      applicantName: applicantName || undefined,
      applicantEmail: email,
      axisId: ensured.axisId,
      origin,
      propertyTitle: propertyTitle || undefined,
      setupToken: ensured.token,
    });

    if (shouldSkipOutboundEmail(email)) {
      return NextResponse.json({ ok: true, skipped: true, mailtoHref, signupUrl });
    }

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Email delivery is not configured.", mailtoHref, signupUrl },
        { status: 503 },
      );
    }

    const from = process.env.RESEND_FROM?.trim() || "Axis <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email], subject: APPLICATION_SUBMITTED_EMAIL_SUBJECT, text, html }),
    });
    const payload = (await res.json().catch(() => ({}))) as { message?: string; id?: string };
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: payload.message ?? res.statusText, mailtoHref }, { status: 502 });
    }
    return NextResponse.json({ ok: true, id: payload.id ?? null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to send email." }, { status: 500 });
  }
}
