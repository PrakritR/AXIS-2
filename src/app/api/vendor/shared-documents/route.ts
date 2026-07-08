import { NextResponse } from "next/server";
import { getReportsAuthContext, assertVendorFinancialsAccess } from "@/lib/reports/auth";
import { listSharedDocumentsForVendor } from "@/lib/documents/document-access";

export const runtime = "nodejs";

export async function GET() {
  const auth = await getReportsAuthContext({ preferRole: "vendor" });
  if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const gate = await assertVendorFinancialsAccess(auth);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const documents = await listSharedDocumentsForVendor(auth.db, auth.userId);
    return NextResponse.json({ documents });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load documents." }, { status: 500 });
  }
}
