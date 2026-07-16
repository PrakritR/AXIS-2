import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { acceptTourInquiry } from "@/lib/tour-inquiry.server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = (await req.json()) as {
      id?: unknown;
      start?: unknown;
      end?: unknown;
      instructions?: unknown;
      notifyTenant?: unknown;
    };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const admin = await isAdminUser(user.id);
    const db = createSupabaseServiceRoleClient();
    const result = await acceptTourInquiry(db, user.id, {
      inquiryId: id,
      start: typeof body.start === "string" ? body.start : undefined,
      end: typeof body.end === "string" ? body.end : undefined,
      instructions: typeof body.instructions === "string" ? body.instructions : undefined,
      notifyTenant: body.notifyTenant === true,
      request: req,
      allowAnyManager: admin,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json({
      ok: true,
      plannedEvent: result.plannedEvent,
      message: result.message,
      tenantNotification: result.tenantNotification,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to approve tour request.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
