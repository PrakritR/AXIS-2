import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import {
  RESIDENT_WELCOME_EMAIL_SUBJECT,
  buildResidentWelcomeEmailBody,
  buildResidentWelcomeEmailHtml,
  buildResidentWelcomeMailtoHref,
  residentAccountCreationUrl,
} from "@/lib/resident-welcome-email";

export const runtime = "nodejs";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function canSendResidentWelcome(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "owner" || role === "pro";
}

function publicOriginFromRequest(req: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "").trim();
  if (fromEnv) return fromEnv;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const proto = (req.headers.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() || "https";
  if (!host) return "http://localhost:3000";
  return `${proto}://${host}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      return NextResponse.json({ error: "Axis ID is required." }, { status: 400 });
    }

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

    const origin = publicOriginFromRequest(req);
    const signupUrl = residentAccountCreationUrl(origin, axisId);
    const text = buildResidentWelcomeEmailBody({
      residentName: residentName || undefined,
      axisId,
      signupUrl,
    });
    const html = buildResidentWelcomeEmailHtml({
      residentName: residentName || undefined,
      axisId,
      signupUrl,
    });
    const mailtoHref = buildResidentWelcomeMailtoHref({
      residentEmail: to,
      residentName: residentName || undefined,
      axisId,
      origin,
    });

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

    const from = process.env.RESEND_FROM?.trim() || "Axis Housing <onboarding@resend.dev>";

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

    return NextResponse.json({ ok: true, id: payload.id ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send welcome email." },
      { status: 500 },
    );
  }
}
