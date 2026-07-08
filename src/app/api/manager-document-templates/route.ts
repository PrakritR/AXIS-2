import { NextResponse } from "next/server";
import { getReportsAuthContext, assertManagerFinancialsAccess } from "@/lib/reports/auth";
import { mapTemplateRow } from "@/lib/documents/document-templates";

export const runtime = "nodejs";

export async function GET() {
  const auth = await getReportsAuthContext({ preferRole: "manager" });
  if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const gate = await assertManagerFinancialsAccess(auth);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { data, error } = await auth.db
    .from("manager_document_templates")
    .select("id, name, category, body_html, merge_fields")
    .eq("manager_user_id", auth.userId)
    .order("name")
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: (data ?? []).map((r) => mapTemplateRow(r as Record<string, unknown>)) });
}

export async function POST(req: Request) {
  const auth = await getReportsAuthContext({ preferRole: "manager" });
  if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const gate = await assertManagerFinancialsAccess(auth);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = (await req.json()) as { name?: string; category?: string; bodyHtml?: string; mergeFields?: unknown[] };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required." }, { status: 400 });

  const now = new Date().toISOString();
  const { data, error } = await auth.db
    .from("manager_document_templates")
    .insert({
      manager_user_id: auth.userId,
      name,
      category: body.category ?? "notice",
      body_html: body.bodyHtml ?? "",
      merge_fields: body.mergeFields ?? [],
      updated_at: now,
    })
    .select("id, name, category, body_html, merge_fields")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: mapTemplateRow(data as Record<string, unknown>) });
}
