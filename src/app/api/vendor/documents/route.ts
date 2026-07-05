import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import {
  isVendorDocumentKind,
  removeVendorDocument,
  type VendorDocumentKind,
  type VendorDocumentRecord,
} from "@/lib/vendor-documents";
import { resolveOwnVendorRecord } from "@/lib/vendor-own-record";

export const runtime = "nodejs";

async function requireVendor(): Promise<
  | { ok: true; userId: string; db: ReturnType<typeof createSupabaseServiceRoleClient> }
  | { ok: false; response: NextResponse }
> {
  const auth = await createSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };

  const db = createSupabaseServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (String(profile?.role ?? "").toLowerCase() !== "vendor") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { ok: true, userId: user.id, db };
}

export async function GET() {
  try {
    const auth = await requireVendor();
    if (!auth.ok) return auth.response;

    const own = await resolveOwnVendorRecord(auth.db, auth.userId);
    return NextResponse.json({
      linked: own !== null,
      documents: own?.row.vendorDocuments ?? [],
      insuranceProvider: own?.row.insuranceProvider ?? "",
      insurancePolicyNumber: own?.row.insurancePolicyNumber ?? "",
      insuranceExpiresAt: own?.row.insuranceExpiresAt ?? "",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load documents.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireVendor();
    if (!auth.ok) return auth.response;

    const own = await resolveOwnVendorRecord(auth.db, auth.userId);
    if (!own) {
      return NextResponse.json({ error: "No linked manager found for this vendor account." }, { status: 400 });
    }

    const body = (await req.json()) as {
      insuranceProvider?: string;
      insurancePolicyNumber?: string;
      insuranceExpiresAt?: string;
      removeKind?: string;
      documents?: VendorDocumentRecord[];
    };

    let vendorDocuments = own.row.vendorDocuments ?? [];
    if (typeof body.removeKind === "string" && isVendorDocumentKind(body.removeKind)) {
      vendorDocuments = removeVendorDocument(vendorDocuments, body.removeKind as VendorDocumentKind);
    }
    if (Array.isArray(body.documents)) {
      vendorDocuments = body.documents.filter(
        (d) =>
          d &&
          isVendorDocumentKind(d.kind) &&
          typeof d.fileName === "string" &&
          typeof d.url === "string" &&
          typeof d.uploadedAt === "string",
      );
    }

    const nextRow: ManagerVendorRow = {
      ...own.row,
      id: own.id,
      managerUserId: own.managerUserId,
      insuranceProvider:
        body.insuranceProvider !== undefined ? body.insuranceProvider.trim() : own.row.insuranceProvider,
      insurancePolicyNumber:
        body.insurancePolicyNumber !== undefined
          ? body.insurancePolicyNumber.trim()
          : own.row.insurancePolicyNumber,
      insuranceExpiresAt:
        body.insuranceExpiresAt !== undefined ? body.insuranceExpiresAt.trim() : own.row.insuranceExpiresAt,
      vendorDocuments,
      updatedAt: new Date().toISOString(),
    };

    const { error } = await auth.db
      .from("manager_vendor_records")
      .update({ row_data: nextRow, updated_at: new Date().toISOString() })
      .eq("id", own.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      documents: nextRow.vendorDocuments ?? [],
      insuranceProvider: nextRow.insuranceProvider ?? "",
      insurancePolicyNumber: nextRow.insurancePolicyNumber ?? "",
      insuranceExpiresAt: nextRow.insuranceExpiresAt ?? "",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save documents.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
