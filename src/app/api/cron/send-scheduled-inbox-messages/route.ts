import { NextResponse } from "next/server";
import { isProductionRuntime } from "@/lib/server-env";
import { deliverPortalInboxMessage } from "@/lib/portal-inbox-delivery";
import { loadDueScheduledInboxMessages, updateScheduledInboxMessage } from "@/lib/scheduled-inbox-messages";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return !isProductionRuntime();
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createSupabaseServiceRoleClient();
  const due = await loadDueScheduledInboxMessages(db);
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const message of due) {
    try {
      const { data: profile } = await db
        .from("profiles")
        .select("email, full_name")
        .eq("id", message.managerUserId)
        .maybeSingle();
      const senderEmail = String(profile?.email ?? "").trim().toLowerCase();
      if (!senderEmail) {
        failed++;
        errors.push(`${message.id}: manager profile missing email`);
        continue;
      }
      const fromName = profile?.full_name?.trim() || "Property manager";

      const result = await deliverPortalInboxMessage(db, {
        senderUserId: message.managerUserId,
        senderEmail,
        fromName,
        subject: message.subject,
        text: message.body,
        toEmails: message.broadcastCategories?.length ? [] : [message.recipientEmail],
        toUserIds: message.recipientUserId ? [message.recipientUserId] : [],
        broadcastCategories: message.broadcastCategories,
        deliverViaEmail: message.deliverViaEmail,
        deliverViaSms: message.deliverViaSms,
      });

      if (!result.ok) {
        failed++;
        errors.push(`${message.id}: ${result.error}`);
        continue;
      }

      await updateScheduledInboxMessage(db, message.managerUserId, message.id, {
        status: "sent",
        sentAt: new Date().toISOString(),
      });
      sent++;
    } catch (e) {
      failed++;
      errors.push(`${message.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({ ok: true, sent, failed, errors: errors.length ? errors : undefined });
}
