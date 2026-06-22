/**
 * Server-side tour notification delivery (Resend email + Axis inbox records).
 */

import { resolveAppOrigin } from "@/lib/app-url";
import {
  TOUR_CONFIRMED_TENANT_SUBJECT,
  TOUR_REQUEST_MANAGER_SUBJECT,
  buildTourConfirmedTenantBody,
  buildTourConfirmedTenantHtml,
  buildTourNotificationContext,
  buildTourRequestManagerBody,
} from "@/lib/tour-notifications";

const MANAGER_INBOX_SCOPE = "axis_portal_inbox_manager_v1";
const RESIDENT_INBOX_SCOPE = "axis_portal_inbox_resident_v1";

type Db = ReturnType<typeof import("@/lib/supabase/service").createSupabaseServiceRoleClient>;

function textField(row: Record<string, unknown> | null | undefined, key: string): string {
  const value = row?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export async function resolvePropertyAddressForTour(
  db: Db,
  propertyId: string | null | undefined,
): Promise<string> {
  const id = textField({ id: propertyId ?? "" }, "id");
  if (!id) return "";
  const { data } = await db.from("manager_property_records").select("id, property_data, row_data").limit(200);
  for (const row of data ?? []) {
    const pd = asObject(row.property_data);
    const rd = asObject(row.row_data);
    const candidateId = textField(pd, "id") || textField(rd, "id") || textField(row as Record<string, unknown>, "id");
    if (candidateId !== id) continue;
    const address = textField(pd, "address") || textField(rd, "address") || textField(asObject(rd?.submission), "address");
    if (address) return address;
  }
  return "";
}

async function deliverEmail(to: string[], subject: string, text: string, html?: string): Promise<{ sent: boolean; skipped: boolean; error?: string }> {
  const recipients = to.map((email) => email.trim().toLowerCase()).filter((email) => email.includes("@") && !email.endsWith("@axis.local"));
  if (recipients.length === 0) return { sent: false, skipped: true };
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { sent: false, skipped: false, error: "Email delivery not configured (RESEND_API_KEY missing)." };
  const from = process.env.RESEND_FROM?.trim() || "Axis <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: recipients,
      subject,
      text,
      ...(html ? { html } : {}),
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) return { sent: false, skipped: false, error: payload.message ?? "Email send failed." };
  return { sent: true, skipped: false };
}

async function upsertInboxThread(
  db: Db,
  input: {
    scope: string;
    ownerUserId: string | null;
    participantEmail: string;
    folder: "inbox" | "sent";
    fromName: string;
    fromEmail: string;
    toLine: string;
    subject: string;
    body: string;
  },
): Promise<void> {
  const when = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const preview = input.body.slice(0, 100).replace(/\n/g, " ");
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  const threadId = `tour_${input.folder}_${ts}_${rand}`;
  await db.from("portal_inbox_thread_records").upsert(
    {
      id: threadId,
      scope: input.scope,
      owner_user_id: input.ownerUserId,
      participant_email: input.participantEmail.trim().toLowerCase(),
      thread_type: "tour_notification",
      row_data: {
        id: threadId,
        folder: input.folder,
        from: input.fromName,
        email: input.folder === "sent" ? input.toLine : input.fromEmail,
        subject: input.subject,
        preview,
        body: input.body,
        time: when,
        unread: input.folder === "inbox",
        scope: input.scope,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}

export type TourInquiryPayload = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  notes?: unknown;
  propertyId?: unknown;
  propertyTitle?: unknown;
  roomLabel?: unknown;
  managerUserId?: unknown;
  adminLabel?: unknown;
  proposedStart?: unknown;
  proposedEnd?: unknown;
};

export async function notifyManagerTourRequest(
  db: Db,
  req: Request,
  inquiry: TourInquiryPayload,
  window?: { start: string; end: string },
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const managerUserId = textField(inquiry as Record<string, unknown>, "managerUserId");
  if (!managerUserId) return { ok: false, error: "Manager not found for tour request." };

  const { data: managerProfile } = await db.from("profiles").select("id, email, full_name").eq("id", managerUserId).maybeSingle();
  const managerEmail = String(managerProfile?.email ?? "").trim().toLowerCase();
  if (!managerEmail) return { ok: false, error: "Manager email not found." };

  const tourStartIso = window?.start || textField(inquiry as Record<string, unknown>, "proposedStart");
  const tourEndIso = window?.end || textField(inquiry as Record<string, unknown>, "proposedEnd");
  const propertyId = textField(inquiry as Record<string, unknown>, "propertyId");
  const propertyAddress = await resolvePropertyAddressForTour(db, propertyId);
  const origin = resolveAppOrigin(req);
  const ctx = buildTourNotificationContext({
    origin,
    guestName: textField(inquiry as Record<string, unknown>, "name") || "Guest",
    guestEmail: textField(inquiry as Record<string, unknown>, "email"),
    guestPhone: textField(inquiry as Record<string, unknown>, "phone") || null,
    propertyId,
    propertyTitle: textField(inquiry as Record<string, unknown>, "propertyTitle") || "Property",
    propertyAddress,
    roomLabel: textField(inquiry as Record<string, unknown>, "roomLabel") || null,
    tourStartIso,
    tourEndIso,
    notes: textField(inquiry as Record<string, unknown>, "notes") || null,
    managerLabel: textField(inquiry as Record<string, unknown>, "adminLabel") || managerProfile?.full_name || null,
  });

  const subject = TOUR_REQUEST_MANAGER_SUBJECT;
  const text = buildTourRequestManagerBody(ctx);

  await upsertInboxThread(db, {
    scope: MANAGER_INBOX_SCOPE,
    ownerUserId: managerUserId,
    participantEmail: managerEmail,
    folder: "inbox",
    fromName: "Axis Tours",
    fromEmail: "tours@axis.local",
    toLine: managerEmail,
    subject,
    body: text,
  });

  const email = await deliverEmail([managerEmail], subject, text);
  if (email.error) return { ok: true, skipped: true, error: email.error };
  return { ok: true, skipped: email.skipped };
}

export async function notifyTenantTourConfirmed(
  db: Db,
  req: Request,
  inquiry: TourInquiryPayload,
  window: { start: string; end: string; managerUserId: string; adminLabel?: string },
  instructions?: string,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const guestEmail = textField(inquiry as Record<string, unknown>, "email");
  if (!guestEmail || !guestEmail.includes("@")) {
    return { ok: false, error: "Guest email is required to send tour confirmation." };
  }

  const propertyId = textField(inquiry as Record<string, unknown>, "propertyId");
  const propertyAddress = await resolvePropertyAddressForTour(db, propertyId);
  const origin = resolveAppOrigin(req);
  const ctx = buildTourNotificationContext({
    origin,
    guestName: textField(inquiry as Record<string, unknown>, "name") || "Guest",
    guestEmail,
    guestPhone: textField(inquiry as Record<string, unknown>, "phone") || null,
    propertyId,
    propertyTitle: textField(inquiry as Record<string, unknown>, "propertyTitle") || "Property",
    propertyAddress,
    roomLabel: textField(inquiry as Record<string, unknown>, "roomLabel") || null,
    tourStartIso: window.start,
    tourEndIso: window.end,
    notes: textField(inquiry as Record<string, unknown>, "notes") || null,
    managerLabel: window.adminLabel || textField(inquiry as Record<string, unknown>, "adminLabel") || null,
    instructions: instructions || null,
  });

  const subject = TOUR_CONFIRMED_TENANT_SUBJECT;
  const text = buildTourConfirmedTenantBody(ctx);
  const html = buildTourConfirmedTenantHtml(ctx);

  const { data: guestProfile } = await db.from("profiles").select("id").eq("email", guestEmail).maybeSingle();

  await upsertInboxThread(db, {
    scope: RESIDENT_INBOX_SCOPE,
    ownerUserId: (guestProfile?.id as string | null) ?? null,
    participantEmail: guestEmail,
    folder: "inbox",
    fromName: "Axis Tours",
    fromEmail: "tours@axis.local",
    toLine: guestEmail,
    subject,
    body: text,
  });

  const email = await deliverEmail([guestEmail], subject, text, html);
  if (email.error) return { ok: true, skipped: true, error: email.error };
  return { ok: true, skipped: email.skipped };
}
