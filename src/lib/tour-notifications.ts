/**
 * Scheduled tour notification copy — shared by portal UI previews and server delivery.
 */

import { formatPacificDateTime } from "@/lib/pacific-time";
import { buildRentalApplyHref } from "@/lib/rental-application/apply-from-listing";

export const TOUR_REQUEST_MANAGER_SUBJECT = "New tour request — Axis";

export const TOUR_CONFIRMED_TENANT_SUBJECT = "Your Axis tour is confirmed";

export type TourNotificationContext = {
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  propertyTitle: string;
  propertyAddress?: string;
  roomLabel?: string;
  tourStartIso: string;
  tourEndIso: string;
  notes?: string;
  managerLabel?: string;
  instructions?: string;
  applyUrl: string;
};

export function formatTourTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Scheduled time";
  const startLabel = formatPacificDateTime(start);
  const endLabel = formatPacificDateTime(end).replace(/^\w{3} \d{1,2}, /, "");
  return `${startLabel} – ${endLabel}`;
}

export function buildTourApplyUrl(origin: string, propertyId?: string | null, roomLabel?: string | null): string {
  const base = origin.replace(/\/$/, "");
  if (!propertyId?.trim()) return `${base}/rent/apply`;
  const path = buildRentalApplyHref({
    propertyId: propertyId.trim(),
    listingRoomName: roomLabel?.trim() || undefined,
  });
  return `${base}${path}`;
}

export function buildTourRequestManagerBody(ctx: TourNotificationContext): string {
  const when = formatTourTimeRange(ctx.tourStartIso, ctx.tourEndIso);
  const lines = [
    "Hi,",
    "",
    "Someone requested a property tour through Axis.",
    "",
    `Guest: ${ctx.guestName || "Guest"}${ctx.guestEmail ? ` (${ctx.guestEmail})` : ""}`,
  ];
  if (ctx.guestPhone?.trim()) lines.push(`Phone: ${ctx.guestPhone.trim()}`);
  lines.push(
    `Property: ${ctx.propertyTitle || "Property"}`,
  );
  if (ctx.roomLabel?.trim()) lines.push(`Room: ${ctx.roomLabel.trim()}`);
  if (ctx.propertyAddress?.trim()) lines.push(`Address: ${ctx.propertyAddress.trim()}`);
  lines.push(`Requested time: ${when}`);
  if (ctx.notes?.trim()) {
    lines.push("", "Notes from guest:", ctx.notes.trim());
  }
  lines.push(
    "",
    "Open your Axis manager portal calendar to approve or decline this tour request.",
    "",
    "— Axis",
  );
  return lines.join("\n");
}

export function buildTourConfirmedTenantBody(ctx: TourNotificationContext): string {
  const greeting = ctx.guestName.trim() ? `Hi ${ctx.guestName.trim()},` : "Hi,";
  const when = formatTourTimeRange(ctx.tourStartIso, ctx.tourEndIso);
  const lines = [
    greeting,
    "",
    "Your property tour is confirmed.",
    "",
    `When: ${when}`,
    `Property: ${ctx.propertyTitle || "Property"}`,
  ];
  if (ctx.roomLabel?.trim()) lines.push(`Room: ${ctx.roomLabel.trim()}`);
  if (ctx.propertyAddress?.trim()) lines.push(`Address: ${ctx.propertyAddress.trim()}`);
  if (ctx.managerLabel?.trim()) lines.push(`Host: ${ctx.managerLabel.trim()}`);
  if (ctx.instructions?.trim()) {
    lines.push("", "Before you arrive:", ctx.instructions.trim());
  }
  lines.push(
    "",
    "Next step — apply for this home",
    "If you are interested after your tour, submit your rental application using the link below:",
    ctx.applyUrl,
    "",
    "What to expect in the application:",
    "• Basic contact and household information",
    "• Employment and income details",
    "• Application fee payment (when required for this listing)",
    "",
    "Questions before or after your tour? Reply in your Axis inbox and your property team will help.",
    "",
    "— Axis",
  );
  return lines.join("\n");
}

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function buildTourConfirmedTenantHtml(ctx: TourNotificationContext): string {
  const greeting = ctx.guestName.trim()
    ? `Hi ${escapeHtmlText(ctx.guestName.trim())},`
    : "Hi,";
  const when = escapeHtmlText(formatTourTimeRange(ctx.tourStartIso, ctx.tourEndIso));
  const property = escapeHtmlText(ctx.propertyTitle || "Property");
  const address = ctx.propertyAddress?.trim()
    ? `<p style="margin:0 0 8px 0"><strong>Address:</strong> ${escapeHtmlText(ctx.propertyAddress.trim())}</p>`
    : "";
  const room = ctx.roomLabel?.trim()
    ? `<p style="margin:0 0 8px 0"><strong>Room:</strong> ${escapeHtmlText(ctx.roomLabel.trim())}</p>`
    : "";
  const host = ctx.managerLabel?.trim()
    ? `<p style="margin:0 0 8px 0"><strong>Host:</strong> ${escapeHtmlText(ctx.managerLabel.trim())}</p>`
    : "";
  const instructions = ctx.instructions?.trim()
    ? `<p style="margin:12px 0 8px 0"><strong>Before you arrive:</strong><br/>${escapeHtmlText(ctx.instructions.trim()).replace(/\n/g, "<br/>")}</p>`
    : "";
  const href = escapeHtmlAttr(ctx.applyUrl);
  const urlPlain = escapeHtmlText(ctx.applyUrl);
  const cta = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0 8px 0">
<tr>
<td style="border-radius:10px;background:#2563eb">
<a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-family:system-ui,-apple-system,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;line-height:1.2">Apply for this home</a>
</td>
</tr>
</table>
<p style="margin:0 0 16px 0;font-size:13px;color:#64748b">If the button does not work, copy this link into your browser:<br/><span style="word-break:break-all;color:#334155">${urlPlain}</span></p>`;

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,sans-serif;line-height:1.55;color:#0f172a;font-size:15px;background:#f8fafc">
<div style="max-width:36rem;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px 28px 32px;border:1px solid #e2e8f0">
<p style="margin:0 0 12px 0">${greeting}</p>
<p style="margin:0 0 12px 0">Your property tour is confirmed.</p>
<p style="margin:0 0 8px 0"><strong>When:</strong> ${when}</p>
<p style="margin:0 0 8px 0"><strong>Property:</strong> ${property}</p>
${room}${address}${host}${instructions}
<p style="margin:16px 0 8px 0"><strong>Next step — apply for this home</strong></p>
<p style="margin:0 0 12px 0">If you are interested after your tour, submit your rental application using the link below.</p>
${cta}
<p style="margin:0;font-size:13px;color:#64748b">Questions? Reply in your Axis inbox and your property team will help.</p>
</div>
</body>
</html>`;
}

export function buildTourNotificationContext(input: {
  origin: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  propertyId?: string | null;
  propertyTitle?: string | null;
  propertyAddress?: string | null;
  roomLabel?: string | null;
  tourStartIso: string;
  tourEndIso: string;
  notes?: string | null;
  managerLabel?: string | null;
  instructions?: string | null;
}): TourNotificationContext {
  return {
    guestName: input.guestName.trim(),
    guestEmail: input.guestEmail.trim(),
    guestPhone: input.guestPhone?.trim() || undefined,
    propertyTitle: input.propertyTitle?.trim() || "Property",
    propertyAddress: input.propertyAddress?.trim() || undefined,
    roomLabel: input.roomLabel?.trim() || undefined,
    tourStartIso: input.tourStartIso,
    tourEndIso: input.tourEndIso,
    notes: input.notes?.trim() || undefined,
    managerLabel: input.managerLabel?.trim() || undefined,
    instructions: input.instructions?.trim() || undefined,
    applyUrl: buildTourApplyUrl(input.origin, input.propertyId, input.roomLabel),
  };
}
