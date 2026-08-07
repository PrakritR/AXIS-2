import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { deliverAdminReplyFromSharedInbox } from "@/lib/admin-shared-inbox.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    if (!(await isAdminUser(user.id))) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }

    const body = (await req.json()) as { threadId?: string; text?: string };
    const threadId = String(body.threadId ?? "").trim();
    const text = String(body.text ?? "").trim();
    if (!threadId || !text) {
      return NextResponse.json({ ok: false, error: "threadId and text are required." }, { status: 400 });
    }

    const db = createSupabaseServiceRoleClient();
    const result = await deliverAdminReplyFromSharedInbox(db, { threadId, replyText: text });
    if (!result.ok) {
      const status = result.error === "Thread not found." ? 404 : 400;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not send reply.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
