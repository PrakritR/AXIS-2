import { NextResponse } from "next/server";
import { getReportsAuthContext, assertResidentFinancialsAccess } from "@/lib/reports/auth";
import { listSharedDocumentsForResident } from "@/lib/documents/document-access";

export const runtime = "nodejs";

export async function GET() {
  const auth = await getReportsAuthContext({ preferRole: "resident" });
  if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const gate = await assertResidentFinancialsAccess(auth);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const documents = await listSharedDocumentsForResident(auth.db, auth.userId, auth.email);
    return NextResponse.json({ documents });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load documents." }, { status: 500 });
  }
}
