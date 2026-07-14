import { NextResponse } from "next/server";
import { createSmsMediaSignedUrl } from "@/lib/sms-media.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * GET /api/sms-media?path=manager/<uid>/<sid>/<n>.<ext> — mint a short-lived
 * signed URL for an MMS attachment the signed-in manager owns and redirect to
 * it. Bucket paths are what gets persisted (signed URLs expire); this route is
 * the read-time access point, mirroring manager-documents.
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const path = new URL(req.url).searchParams.get("path")?.trim() ?? "";
  // Ownership: the path is namespaced manager/<manager_user_id>/... — only the
  // owning manager may mint a link. A denial matches a missing object's 404.
  if (!path.startsWith(`manager/${user.id}/`) || path.includes("..")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const db = createSupabaseServiceRoleClient();
  const signedUrl = await createSmsMediaSignedUrl(db, path);
  if (!signedUrl) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.redirect(signedUrl, 302);
}
