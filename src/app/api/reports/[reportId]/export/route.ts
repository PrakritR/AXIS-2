import { NextResponse } from "next/server";
import {
  assertManagerFinancialsAccess,
  assertResidentFinancialsAccess,
  getReportsAuthContext,
} from "@/lib/reports/auth";
import { reportToCsv } from "@/lib/reports/export/csv";
import { reportToPdf } from "@/lib/reports/export/pdf";
import {
  MANAGER_REPORT_IDS,
  RESIDENT_REPORT_IDS,
  type ManagerReportFilters,
} from "@/lib/reports/types";
import { runManagerReport, queryResidentBalance, queryResidentLedger } from "@/lib/reports/queries";

export const runtime = "nodejs";

function parseFilters(searchParams: URLSearchParams): ManagerReportFilters {
  return {
    propertyId: searchParams.get("propertyId")?.trim() || undefined,
    from: searchParams.get("from")?.trim() || undefined,
    to: searchParams.get("to")?.trim() || undefined,
    daysAhead: searchParams.get("daysAhead") ? Number(searchParams.get("daysAhead")) : undefined,
    taxYear: searchParams.get("taxYear") ? Number(searchParams.get("taxYear")) : undefined,
    vendorId: searchParams.get("vendorId")?.trim() || undefined,
  };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await ctx.params;
    const isResidentReport = RESIDENT_REPORT_IDS.includes(reportId as (typeof RESIDENT_REPORT_IDS)[number]);
    const auth = await getReportsAuthContext({ preferRole: isResidentReport ? "resident" : "manager" });
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const searchParams = new URL(req.url).searchParams;
    const format = searchParams.get("format") === "pdf" ? "pdf" : "csv";

    let report;
    if (isResidentReport) {
      const gate = await assertResidentFinancialsAccess(auth);
      if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
      const filters = {
        from: searchParams.get("from")?.trim() || undefined,
        to: searchParams.get("to")?.trim() || undefined,
      };
      report =
        reportId === "resident-balance"
          ? await queryResidentBalance(auth.db, auth.userId, auth.email)
          : await queryResidentLedger(auth.db, auth.userId, auth.email, filters);
    } else {
      if (!MANAGER_REPORT_IDS.includes(reportId as (typeof MANAGER_REPORT_IDS)[number])) {
        return NextResponse.json({ error: "Unknown report." }, { status: 404 });
      }
      const gate = await assertManagerFinancialsAccess(auth);
      if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
      const managerUserId =
        auth.role === "admin" ? searchParams.get("managerUserId")?.trim() || auth.userId : auth.userId;
      report = await runManagerReport(auth.db, managerUserId, reportId, parseFilters(searchParams));
    }

    if (!report) return NextResponse.json({ error: "Unknown report." }, { status: 404 });

    const filenameBase = `${report.id}-${new Date().toISOString().slice(0, 10)}`;

    if (format === "pdf") {
      const bytes = await reportToPdf(report);
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
        },
      });
    }

    const csv = reportToCsv(report);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to export report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
