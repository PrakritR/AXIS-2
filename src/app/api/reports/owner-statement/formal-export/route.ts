import { NextResponse } from "next/server";
import { buildOwnerStatementPdf, type OwnerStatementLine } from "@/lib/reports/export/formal/owner-statement-pdf";
import { assertManagerFinancialsAccess, getReportsAuthContext } from "@/lib/reports/auth";
import { loadManagerReportDisplayContext } from "@/lib/reports/display-context";
import { parseManagerReportFilters } from "@/lib/reports/parse-filters";
import { queryOwnerStatement } from "@/lib/reports/queries/ap-reports";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

async function loadLandlordIdentity(db: SupabaseClient, managerUserId: string) {
  const { data } = await db
    .from("manager_tax_profiles")
    .select("legal_name, address_line1, address_line2, city, state, zip")
    .eq("manager_user_id", managerUserId)
    .maybeSingle();
  const name = data?.legal_name?.trim() || "Property manager";
  const address = [
    data?.address_line1?.trim(),
    data?.address_line2?.trim(),
    [data?.city, data?.state, data?.zip].filter(Boolean).join(", ").trim(),
  ]
    .filter(Boolean)
    .join("\n") || "—";
  return { name, address };
}

async function loadOwnerName(db: SupabaseClient, managerUserId: string, propertyId: string): Promise<string> {
  if (!propertyId) return "Property owner";
  const { data } = await db
    .from("manager_property_owners")
    .select("owner_name")
    .eq("manager_user_id", managerUserId)
    .eq("property_id", propertyId)
    .limit(1)
    .maybeSingle();
  return (data?.owner_name as string | undefined)?.trim() || "Property owner";
}

export async function GET(req: Request) {
  try {
    const auth = await getReportsAuthContext({ preferRole: "manager" });
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const url = new URL(req.url);
    const searchParams = url.searchParams;
    const managerUserId = auth.role === "admin" ? searchParams.get("managerUserId")?.trim() || auth.userId : auth.userId;
    const filters = parseManagerReportFilters(searchParams);

    const report = await queryOwnerStatement(auth.db, managerUserId, filters);
    const [landlord, display, ownerName] = await Promise.all([
      loadLandlordIdentity(auth.db, managerUserId),
      loadManagerReportDisplayContext(auth.db, managerUserId),
      loadOwnerName(auth.db, managerUserId, filters.propertyId ?? ""),
    ]);

    const amountByLine = new Map(report.rows.map((r) => [String(r.line), String(r.amount)]));
    const lines: OwnerStatementLine[] = [
      { label: "Cash in (collections)", amount: amountByLine.get("Cash in (collections)") ?? "$0.00" },
      { label: "Cash out (expenses paid)", amount: amountByLine.get("Cash out (expenses paid)") ?? "$0.00" },
      { label: "Management fee", amount: amountByLine.get("Management fee") ?? "$0.00" },
      { label: "Reserve holdback", amount: amountByLine.get("Reserve holdback") ?? "$0.00" },
    ];

    const pdf = await buildOwnerStatementPdf({
      issueDate: new Date().toISOString().slice(0, 10),
      periodFrom: String(report.meta?.from ?? ""),
      periodTo: String(report.meta?.to ?? ""),
      landlordName: landlord.name,
      landlordAddress: landlord.address,
      ownerName,
      propertyLabel: filters.propertyId ? display.propertyLabel(filters.propertyId) : "Entire portfolio",
      lines,
      distribution: String(report.meta?.distribution ?? amountByLine.get("Distribution") ?? "$0.00"),
      billsDue: amountByLine.get("Bills due (unpaid AP)") ?? "$0.00",
    });

    const disposition = searchParams.get("disposition") === "inline" ? "inline" : "attachment";
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="owner-statement-${report.meta?.from ?? "period"}.pdf"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to export owner statement.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
