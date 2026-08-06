import { ensureFreeManagerPortalAccess } from "@/lib/auth/manager-portal-provision";
import { resolveRequestOrigin } from "@/lib/app-url";
import { finalizeManagerGoogleCalendarLink } from "@/lib/google-calendar/link-after-manager-provision.server";
import { resolveManagerPortalEntryPath } from "@/lib/auth/manager-google-services-onboarding.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Ensures the signed-in user has a manager portal account (idempotent). */
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    const {
      data: { session },
    } = await supabaseAuth.auth.getSession();

    if (!user?.id || !user.email) {
      return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
    }

    // Manager OAuth registration ("Create account → Manager → Google") opts a
    // genuinely-new account onto a 14-day Pro trial; the pricing free-select /
    // paid pre-step caller posts no body and stays free.
    const body = (await request.json().catch(() => null)) as { trial?: unknown } | null;
    const trialForNewManager = body?.trial === true;

    const service = createSupabaseServiceRoleClient();
    const result = await ensureFreeManagerPortalAccess(service, user, { trialForNewManager });

    if (result.status === "skipped") {
      return NextResponse.json({ ok: false, skipped: true, reason: result.reason }, { status: 409 });
    }

    const calendar = await finalizeManagerGoogleCalendarLink(
      service,
      user,
      session,
      resolveRequestOrigin(request),
      { intent: "manager" },
    );

    return NextResponse.json({
      ok: true,
      managerId: result.managerId,
      provisioned: result.provisioned,
      redirectTo: await resolveManagerPortalEntryPath(service, user.id),
      calendarConnected: calendar.connected,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create manager account.";
    const status = message.includes("already exists") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
