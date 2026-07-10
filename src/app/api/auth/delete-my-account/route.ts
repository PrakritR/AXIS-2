import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import { deleteOwnAccount } from "@/lib/auth/delete-portal-account";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * Self-service account deletion (App Store Guideline 5.1.1(v)).
 *
 * The target is ALWAYS the authenticated caller resolved from their own session
 * cookie/JWT — a user id/email is never accepted from the request body, so no one
 * can delete another account. Requires an explicit { "confirm": "DELETE" } body.
 * The service-role client is used only inside this route.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { confirm?: unknown } = {};
  try {
    body = (await req.json()) as { confirm?: unknown };
  } catch {
    /* empty/invalid body → confirmation check below fails */
  }
  if (body.confirm !== "DELETE") {
    return NextResponse.json(
      { error: 'Confirmation required. Send { "confirm": "DELETE" } to permanently delete your account.' },
      { status: 400 },
    );
  }

  const svc = createSupabaseServiceRoleClient();
  try {
    await deleteOwnAccount(svc, user.id);
  } catch (e) {
    // Log the real cause server-side, but never surface raw DB/Stripe error text
    // (which can leak internal schema/details) to the client toast.
    console.error("delete-my-account failed", e);
    return NextResponse.json(
      { error: "We couldn't delete your account. Please try again, or contact support if it keeps happening." },
      { status: 500 },
    );
  }

  // Server-confirmed churn outcome (id only — never PII per analytics rules).
  track("account_deleted", user.id, {});

  // The auth user is gone; clear the now-orphaned session cookie so the client
  // lands signed out.
  await supabase.auth.signOut().catch(() => undefined);

  return NextResponse.json({ ok: true });
}
