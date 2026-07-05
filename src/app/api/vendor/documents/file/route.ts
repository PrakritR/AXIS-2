import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { findVendorDocument, isVendorDocumentKind } from "@/lib/vendor-documents";
import { resolveOwnVendorRecord } from "@/lib/vendor-own-record";

export const runtime = "nodejs";

/** Streams a vendor-owned compliance file — auth required; storage paths are never public. */
export async function GET(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (String(profile?.role ?? "").toLowerCase() !== "vendor") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const kind = new URL(req.url).searchParams.get("kind") ?? "";
    if (!isVendorDocumentKind(kind)) {
      return NextResponse.json({ error: "Valid document kind required." }, { status: 400 });
    }

    const own = await resolveOwnVendorRecord(db, user.id);
    if (!own) return NextResponse.json({ error: "No linked manager found." }, { status: 404 });

    const doc = findVendorDocument(own.row.vendorDocuments, kind);
    const storagePath = doc?.storagePath?.trim();
    if (!doc || !storagePath) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const { data, error } = await db.storage.from("listing-photos").download(storagePath);
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Download failed." }, { status: 500 });

    const bytes = Buffer.from(await data.arrayBuffer());
    const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";
    const contentType =
      ext === "pdf"
        ? "application/pdf"
        : ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : "image/jpeg";

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${doc.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Download failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
