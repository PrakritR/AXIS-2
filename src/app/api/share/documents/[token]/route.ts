import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { MANAGER_DOCUMENTS_BUCKET } from "@/lib/documents/manager-documents";
import { resolveDocumentShareToken } from "@/lib/documents/document-share-links.server";

export const runtime = "nodejs";

/** Public download/preview for an expiring document share link (no auth). */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const db = createSupabaseServiceRoleClient();
    const resolved = await resolveDocumentShareToken(db, decodeURIComponent(token));
    if (!resolved) return NextResponse.json({ error: "Link expired or invalid." }, { status: 404 });

    const download = new URL(req.url).searchParams.get("download") === "1";
    const { data, error } = await db.storage
      .from(MANAGER_DOCUMENTS_BUCKET)
      .createSignedUrl(resolved.document.storagePath, 600, {
        download: download ? resolved.document.displayName : false,
      });
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: "Could not load document." }, { status: 500 });
    }

    if (download) return NextResponse.redirect(data.signedUrl, 302);
    return NextResponse.json({
      displayName: resolved.document.displayName,
      mimeType: resolved.document.mimeType,
      url: data.signedUrl,
      expiresAt: resolved.link.expiresAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
