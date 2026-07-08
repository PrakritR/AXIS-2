import { NextResponse } from "next/server";
import { assertManagerFinancialsAccess, getReportsAuthContext } from "@/lib/reports/auth";
import { applyMergeFields, mapTemplateRow } from "@/lib/documents/document-templates";
import { renderHtmlDocumentPdf } from "@/lib/reports/export/document-pdf";

export const runtime = "nodejs";

/**
 * Render a document template to a branded PDF: loads the template's stored HTML,
 * substitutes {{merge_field}} tokens with the supplied values, and flattens the
 * result to a PDF via the shared pdf-theme (Documents plan §template output).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getReportsAuthContext({ preferRole: "manager" });
  if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const gate = await assertManagerFinancialsAccess(auth);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    values?: Record<string, string>;
    disposition?: "inline" | "attachment";
  };

  const { data, error } = await auth.db
    .from("manager_document_templates")
    .select("id, name, category, body_html, merge_fields")
    .eq("id", id)
    .eq("manager_user_id", auth.userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  const template = mapTemplateRow(data as Record<string, unknown>);
  const values = body.values ?? {};

  const missing = template.mergeFields
    .filter((field) => field.required && !(values[field.key] ?? "").trim())
    .map((field) => field.label || field.key);
  if (missing.length > 0) {
    return NextResponse.json({ error: `Missing required fields: ${missing.join(", ")}` }, { status: 400 });
  }

  const merged = applyMergeFields(template.bodyHtml, values);
  const pdf = await renderHtmlDocumentPdf({ title: template.name, html: merged });

  const disposition = body.disposition === "inline" ? "inline" : "attachment";
  const safeName = template.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "template";
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${safeName}.pdf"`,
    },
  });
}
