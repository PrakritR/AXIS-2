import { NextResponse } from "next/server";
import { notifyManagerPropertyLeadMessage } from "@/lib/property-lead-notification.server";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
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
    return { managerUserId: null, propertyTitle: propertyId };
  }

  const pd = data.property_data as { title?: string } | null;
  const rd = data.row_data as { title?: string } | null;
  const title = textField(pd?.title) || textField(rd?.title) || propertyId;
  return { managerUserId: (data.manager_user_id as string | null) ?? null, propertyTitle: title };
}

export async function POST(req: Request) {
  try {
<<<<<<< HEAD
    // Public, unauthenticated endpoint that emails a manager — rate-limit per IP
    // to prevent spam / inbox flooding via the full-table property lookup.
    if (!rateLimit(`property-lead:${clientIpFrom(req)}`, 5, 60_000).ok) {
      return NextResponse.json({ error: "Too many messages. Please wait a minute and try again." }, { status: 429 });
=======
    if (!rateLimit(`property-lead-message:${clientIpFrom(req)}`, 15, 60_000).ok) {
      return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
>>>>>>> fm/captain-wip-ship-s1
    }

    const body = (await req.json()) as {
      propertyId?: string;
      name?: string;
      email?: string;
      phone?: string;
      topic?: string;
      body?: string;
    };

    // Cap every field so a caller can't ship megabytes into the email/inbox.
    const propertyId = textField(body.propertyId).slice(0, 200);
    const name = textField(body.name).slice(0, 200);
    const email = textField(body.email).toLowerCase().slice(0, 320);
    const phone = textField(body.phone).slice(0, 40);
    const topic = textField(body.topic).slice(0, 200);
    const message = textField(body.body).slice(0, 4000);

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
