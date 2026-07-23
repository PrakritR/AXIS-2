import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { canManageResidentApproval, setResidentApprovalForManager } from "@/lib/resident-approval.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function PATCH(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    let body: { email?: unknown; approved?: unknown };
    try {
      body = (await req.json()) as { email?: unknown; approved?: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const email = normalizeEmail(body.email);
    const approved = typeof body.approved === "boolean" ? body.approved : null;
    if (!email || approved == null) {
      return NextResponse.json({ error: "Email and approved are required." }, { status: 400 });
    }

    const svc = createSupabaseServiceRoleClient();
    const { data: requestor, error: requestorError } = await svc
      .from("profiles")
      .select("role, email")
      .eq("id", user.id)
      .maybeSingle();

    if (requestorError || !requestor) {
      return NextResponse.json({ error: requestorError?.message ?? "Profile not found." }, { status: 403 });
    }

    if (requestor.role === "resident") {
      // Residents may only touch their own row — updated by id, never by email.
      const requestorEmail = normalizeEmail(requestor.email);
      if (requestorEmail !== email) {
        return NextResponse.json({ error: "Residents may only update their own access status." }, { status: 403 });
      }
      const { error } = await svc
        .from("profiles")
        .update({ application_approved: approved, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    } else {
      if (!canManageResidentApproval(requestor.role)) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      // Non-admin managers may only update residents in their own portfolio —
      // enforced inside the shared lib (the check this route previously lacked).
      const isAdmin = requestor.role === "admin" || (await isAdminUser(user.id));
      const result = await setResidentApprovalForManager(svc, { userId: user.id, isAdmin }, { email, approved });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
    }

    track("resident_approval_updated", user.id, { approved });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync resident approval." },
      { status: 500 },
    );
  }
}
