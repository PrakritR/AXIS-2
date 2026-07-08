import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { provisionSandboxAccounts } from "@/lib/demo/provision-sandbox-accounts.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * Admin-gated, run-once-per-environment: provisions the canonical sandbox
 * accounts (manager@ / resident@ / vendor@ / testeverything@test.axis.local)
 * with their roles, pro tier, and (by default) the idle demo portfolio into
 * THIS deployment's database. On production this is what connects `/demo`'s
 * read mirror and the guided tour to real, sign-in-able test accounts — the
 * same wiring `npm run test:seed` gives the dev/test project.
 *
 * Body: { "seedPortfolio": false } to provision accounts only.
 * Never deletes anything; re-running repairs passwords/roles in place.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!(await isAdminUser(user.id))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { seedPortfolio?: boolean };
    const db = createSupabaseServiceRoleClient();
    const result = await provisionSandboxAccounts(db, { seedPortfolio: body.seedPortfolio ?? true });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to provision sandbox accounts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
