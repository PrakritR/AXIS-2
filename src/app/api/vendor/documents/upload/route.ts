import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import { isVendorDocumentKind, upsertVendorDocument, type VendorDocumentKind } from "@/lib/vendor-documents";
import { resolveOwnVendorRecord } from "@/lib/vendor-own-record";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export async function POST(req: Request) {
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

    const own = await resolveOwnVendorRecord(db, user.id);
    if (!own) {
      return NextResponse.json({ error: "No linked manager found for this vendor account." }, { status: 400 });
    }

    const body = (await req.json()) as { dataUrl?: string; kind?: string; fileName?: string; ext?: string };
    const kind = body.kind ?? "";
    if (!isVendorDocumentKind(kind)) {
      return NextResponse.json({ error: "Valid document kind required." }, { status: 400 });
    }

    const dataUrl = body.dataUrl;
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
      return NextResponse.json({ error: "dataUrl required." }, { status: 400 });
    }

    const [header, b64] = dataUrl.split(",");
    if (!header || !b64) return NextResponse.json({ error: "Invalid data URL." }, { status: 400 });

    const mimeMatch = header.match(/data:([^;]+)/);
    const mime = mimeMatch?.[1] ?? "application/pdf";
    if (!ALLOWED_MIME.has(mime)) {
      return NextResponse.json({ error: "Only PDF, JPEG, PNG, and WebP files are allowed." }, { status: 400 });
    }

    const bytes = Buffer.from(b64, "base64");
    if (bytes.length > MAX_BYTES) {
      return NextResponse.json({ error: "File must be 5 MB or smaller." }, { status: 400 });
    }

    const ext =
      body.ext ??
      (mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg");
    const safeName =
      typeof body.fileName === "string" && body.fileName.trim()
        ? body.fileName.trim().replace(/[^\w.\-() ]+/g, "_").slice(0, 120)
        : `${kind}.${ext}`;
    const storagePath = `vendor-documents/${user.id}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await db.storage.from("listing-photos").upload(storagePath, bytes, {
      contentType: mime,
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const record = {
      kind: kind as VendorDocumentKind,
      fileName: safeName,
      storagePath,
      url: `/api/vendor/documents/file?kind=${encodeURIComponent(kind)}`,
      uploadedAt: new Date().toISOString(),
    };

    const nextRow: ManagerVendorRow = {
      ...own.row,
      id: own.id,
      managerUserId: own.managerUserId,
      vendorDocuments: upsertVendorDocument(own.row.vendorDocuments, record),
      updatedAt: new Date().toISOString(),
    };

    const { error } = await db
      .from("manager_vendor_records")
      .update({ row_data: nextRow, updated_at: new Date().toISOString() })
      .eq("id", own.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ document: record, documents: nextRow.vendorDocuments ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
