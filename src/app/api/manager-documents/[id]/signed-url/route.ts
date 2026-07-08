import { NextResponse } from "next/server";
import { getReportsAuthContext, assertManagerFinancialsAccess } from "@/lib/reports/auth";
import { DOCUMENT_MIME_EXTENSIONS, MANAGER_DOCUMENTS_BUCKET, UUID_PATTERN } from "@/lib/documents/manager-documents";

export const runtime = "nodejs";

// Signed URLs are short-lived; enough to open a preview or start a download.
const SIGNED_URL_TTL_SECONDS = 600; // 10 minutes

// The name the browser saves the file as. Display names are typically entered
// without an extension, so prefer the original filename and otherwise append
// the extension from the storage path (always `<unique>.<ext>`) or MIME type.
function resolveDownloadName(row: {
  display_name: string;
  original_filename: string | null;
  storage_path: string;
  mime_type: string;
}): string {
  const original = (row.original_filename ?? "").trim();
  if (original) return original;
  const display = row.display_name;
  if (/\.[a-z0-9]{1,8}$/i.test(display)) return display;
  const pathExt = /\.([a-z0-9]{1,8})$/i.exec(row.storage_path)?.[1];
  const ext = pathExt ?? DOCUMENT_MIME_EXTENSIONS[row.mime_type];
  return ext ? `${display}.${ext}` : display;
}

// GET /api/manager-documents/[id]/signed-url — return a short-lived signed URL
// for previewing/downloading a document the signed-in manager owns. The bucket
// is private; this is the ONLY way a document's bytes are reachable, and it is
// gated on an explicit ownership check before any URL is minted.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await getReportsAuthContext({ preferRole: "manager" });
  if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const gate = await assertManagerFinancialsAccess(auth);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const { data: row, error } = await auth.db
    .from("manager_documents")
    .select("storage_path, display_name, original_filename, mime_type")
    .eq("id", id)
    .eq("manager_user_id", auth.userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const download = new URL(req.url).searchParams.get("download") === "1";
  const { data: signed, error: signError } = await auth.db.storage
    .from(MANAGER_DOCUMENTS_BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS, download ? { download: resolveDownloadName(row) } : undefined);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: signError?.message ?? "Failed to sign URL." }, { status: 500 });
  }

  return NextResponse.json({
    url: signed.signedUrl,
    mimeType: row.mime_type,
    displayName: row.display_name,
    ...(download ? { fileName: resolveDownloadName(row) } : {}),
  });
}
