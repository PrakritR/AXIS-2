import { NextResponse } from "next/server";
import { notifyManagerPropertyLeadMessage } from "@/lib/property-lead-notification.server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function textField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function resolveManagerForProperty(propertyId: string): Promise<{
  managerUserId: string | null;
  propertyTitle: string;
}> {
  const db = createSupabaseServiceRoleClient();
  const { data } = await db
    .from("manager_property_records")
    .select("id, manager_user_id, property_data, row_data, status")
    .eq("id", propertyId)
    .maybeSingle();

  if (!data) {
    const { data: rows } = await db.from("manager_property_records").select("id, manager_user_id, property_data, row_data, status").limit(500);
    for (const row of rows ?? []) {
      const pd = row.property_data as { id?: string; title?: string } | null;
      const rd = row.row_data as { id?: string; title?: string } | null;
      const candidateId = textField(pd?.id) || textField(rd?.id) || textField(row.id);
      if (candidateId !== propertyId) continue;
      const title = textField(pd?.title) || textField(rd?.title) || propertyId;
      return { managerUserId: (row.manager_user_id as string | null) ?? null, propertyTitle: title };
    }
    return { managerUserId: null, propertyTitle: propertyId };
  }

  const pd = data.property_data as { title?: string } | null;
  const rd = data.row_data as { title?: string } | null;
  const title = textField(pd?.title) || textField(rd?.title) || propertyId;
  return { managerUserId: (data.manager_user_id as string | null) ?? null, propertyTitle: title };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      propertyId?: string;
      name?: string;
      email?: string;
      phone?: string;
      topic?: string;
      body?: string;
    };

    const propertyId = textField(body.propertyId);
    const name = textField(body.name);
    const email = textField(body.email).toLowerCase();
    const phone = textField(body.phone);
    const topic = textField(body.topic);
    const message = textField(body.body);

    if (!propertyId) return NextResponse.json({ error: "propertyId is required." }, { status: 400 });
    if (!name || !email.includes("@")) return NextResponse.json({ error: "Name and valid email are required." }, { status: 400 });
    if (!topic) return NextResponse.json({ error: "Topic is required." }, { status: 400 });
    if (!message) return NextResponse.json({ error: "Message is required." }, { status: 400 });

    const { managerUserId, propertyTitle } = await resolveManagerForProperty(propertyId);
    if (!managerUserId) {
      return NextResponse.json({ error: "Property not found or manager unavailable." }, { status: 404 });
    }

    await notifyManagerPropertyLeadMessage({
      managerUserId,
      propertyId,
      propertyTitle,
      name,
      email,
      phone: phone || undefined,
      topic,
      body: message,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not send message.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
