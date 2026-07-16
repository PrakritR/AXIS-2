/**
 * Resident SMS command hub — run classified intents (chatbot actions + manager brief).
 */

import type { HouseholdCharge } from "@/lib/household-charges";
import {
  createWorkOrderFromResidentSms,
  maintenanceWorkOrderResidentAck,
} from "@/lib/claw-maintenance-work-order.server";
import {
  createServiceRequestFromResidentSms,
  serviceRequestResidentAck,
} from "@/lib/claw-service-request-sms.server";
import {
  classifyResidentSmsIntent,
  residentHelpMenuText,
  type ClassifiedResidentSms,
} from "@/lib/claw-resident-intents";
import { managerPortalUrlFromPath, residentPortalUrl } from "@/lib/claw-resident-links";
import { residentInboundAck, type ClawThreadTopic } from "@/lib/claw-resident-messaging.server";
import { reportManualPaymentForResident } from "@/lib/resident-report-manual-payment.server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export type ResidentSmsActionResult = {
  classification: ClassifiedResidentSms;
  residentReply: string;
  /** Extra lines appended under the brief (auto-filed ids, etc.). */
  autoFiledNote: string | null;
  threadTopic: ClawThreadTopic;
  forwardSaid: string;
};

export function buildManagerResidentBrief(args: {
  residentName: string;
  residentEmail?: string | null;
  residentPhone: string;
  said: string;
  wants: string;
  domain: string;
  managerPath: string;
  autoFiledNote?: string | null;
}): string {
  const who = [
    args.residentName.trim() || "Resident",
    args.residentEmail?.trim() ? `(${args.residentEmail.trim()})` : null,
    args.residentPhone.trim() ? args.residentPhone.trim() : null,
  ]
    .filter(Boolean)
    .join(" ");

  const lines = [
    `Resident ${who} said:`,
    `"${(args.said || "").trim() || "(empty)"}"`,
    "",
    `Wants: ${args.wants}`,
    `Domain: ${args.domain}`,
    `Open: ${managerPortalUrlFromPath(args.managerPath)}`,
  ];
  if (args.autoFiledNote?.trim()) {
    lines.push("", args.autoFiledNote.trim());
  }
  lines.push("", "Reply in this thread to text them back.");
  return lines.join("\n");
}

export function formatPendingChargesForSms(charges: HouseholdCharge[]): string {
  if (charges.length === 0) {
    return ["No pending charges right now.", `Pay / view charges: ${residentPortalUrl("payments")}`].join("\n");
  }
  const lines = ["Your pending charges:"];
  for (const c of charges.slice(0, 8)) {
    const due = c.dueDateLabel?.trim() ? ` · due ${c.dueDateLabel.trim()}` : "";
    const balance = (c.balanceLabel || c.amountLabel || "").trim() || "—";
    lines.push(`• ${c.title.trim() || "Charge"} — ${balance}${due}`);
  }
  if (charges.length > 8) lines.push(`…and ${charges.length - 8} more`);
  lines.push("", `Pay / view charges: ${residentPortalUrl("payments")}`);
  return lines.join("\n");
}

async function listPendingChargesForResident(args: {
  residentEmail: string;
  managerUserId?: string | null;
}): Promise<HouseholdCharge[]> {
  const email = args.residentEmail.trim().toLowerCase();
  const db = createSupabaseServiceRoleClient();
  let q = db
    .from("portal_household_charge_records")
    .select("row_data, status")
    .eq("resident_email", email)
    .in("status", ["pending", "processing", "partially_paid", "failed"]);
  if (args.managerUserId?.trim()) {
    q = q.eq("manager_user_id", args.managerUserId.trim());
  }
  const { data } = await q.order("updated_at", { ascending: false }).limit(30);
  const out: HouseholdCharge[] = [];
  for (const row of data ?? []) {
    const charge = (row as { row_data?: HouseholdCharge }).row_data;
    if (!charge?.id) continue;
    if (charge.status === "paid" || charge.status === "cancelled" || charge.status === "refunded") continue;
    out.push(charge);
  }
  return out;
}

async function resolveResidentDisplayName(args: {
  residentUserId?: string | null;
  residentEmail: string;
}): Promise<string> {
  const db = createSupabaseServiceRoleClient();
  if (args.residentUserId) {
    const { data } = await db.from("profiles").select("full_name").eq("id", args.residentUserId).maybeSingle();
    const name = String((data as { full_name?: unknown } | null)?.full_name ?? "").trim();
    if (name) return name;
  }
  const { data: app } = await db
    .from("manager_application_records")
    .select("row_data")
    .eq("email", args.residentEmail.trim().toLowerCase())
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const name = String(((app as { row_data?: { name?: string } } | null)?.row_data ?? {}).name ?? "").trim();
  return name || "Resident";
}

export async function runResidentSmsAction(args: {
  text: string;
  residentPhone: string;
  managerUserId: string;
  residentUserId?: string | null;
  residentEmail?: string | null;
  threadTopic?: ClawThreadTopic;
}): Promise<ResidentSmsActionResult & { residentName: string }> {
  const text = args.text.trim();
  const classification = classifyResidentSmsIntent(text);
  const residentEmail = (args.residentEmail ?? "").trim().toLowerCase();
  const residentName = residentEmail
    ? await resolveResidentDisplayName({
        residentUserId: args.residentUserId,
        residentEmail,
      })
    : "Resident";

  let residentReply = "";
  let autoFiledNote: string | null = null;
  let threadTopic: ClawThreadTopic = args.threadTopic ?? "general";
  let wants = classification.wantsLabel;

  switch (classification.intent) {
    case "help":
    case "greeting": {
      residentReply = [
        classification.intent === "greeting" ? `Hi${residentName !== "Resident" ? ` ${residentName}` : ""}!` : null,
        residentHelpMenuText(),
      ]
        .filter(Boolean)
        .join("\n\n");
      break;
    }
    case "maintenance": {
      if (!residentEmail) {
        residentReply = [
          "I can file a maintenance request once your account phone is linked.",
          `Open services: ${residentPortalUrl("services")}`,
        ].join("\n");
        break;
      }
      const wo = await createWorkOrderFromResidentSms({
        managerUserId: args.managerUserId,
        residentPhone: args.residentPhone,
        residentUserId: args.residentUserId,
        residentEmail,
        text,
        senderUserId: args.residentUserId,
      });
      residentReply =
        maintenanceWorkOrderResidentAck(wo) ||
        `Could not file that automatically. Please use: ${residentPortalUrl("services")}`;
      if ("workOrderId" in wo && wo.workOrderId) {
        autoFiledNote = wo.created
          ? `PropLane auto-filed work order ${wo.workOrderId} (${wo.title}).`
          : wo.alreadyOpen
            ? `PropLane matched existing work order ${wo.workOrderId} (${wo.title}).`
            : null;
        wants = wo.created
          ? `file maintenance work order (${wo.title})`
          : `follow up on open work order (${wo.title})`;
      }
      threadTopic = "general";
      break;
    }
    case "service_request": {
      if (!residentEmail) {
        residentReply = `Open services to submit a request: ${residentPortalUrl("services")}`;
        break;
      }
      const sr = await createServiceRequestFromResidentSms({
        managerUserId: args.managerUserId,
        residentEmail,
        residentUserId: args.residentUserId,
        residentName,
        text,
      });
      residentReply =
        serviceRequestResidentAck(sr) ||
        `Could not file that automatically. Please use: ${residentPortalUrl("services")}`;
      if ("requestId" in sr && sr.requestId) {
        autoFiledNote = sr.created
          ? `PropLane auto-filed service request ${sr.requestId} (${sr.title}).`
          : sr.alreadyOpen
            ? `PropLane matched existing service request ${sr.requestId} (${sr.title}).`
            : null;
        wants = `submit service request (${sr.title})`;
      }
      threadTopic = "general";
      break;
    }
    case "balance":
    case "pay": {
      threadTopic = "payment";
      if (!residentEmail) {
        residentReply = `Sign in to view charges: ${residentPortalUrl("payments")}`;
        break;
      }
      const charges = await listPendingChargesForResident({
        residentEmail,
        managerUserId: args.managerUserId,
      });
      residentReply = formatPendingChargesForSms(charges);
      wants =
        classification.intent === "balance"
          ? `see balance (${charges.length} open charge${charges.length === 1 ? "" : "s"})`
          : `pay rent / open payment link (${charges.length} open)`;
      break;
    }
    case "i_paid": {
      threadTopic = "payment";
      if (!residentEmail) {
        residentReply = [
          "Please report the payment in your portal so we can match the charge.",
          `Open payments: ${residentPortalUrl("payments")}`,
        ].join("\n");
        break;
      }
      const report = await reportManualPaymentForResident({
        residentUserId: args.residentUserId,
        residentEmail,
        textHint: text,
        managerUserId: args.managerUserId,
      });
      if (!report.ok) {
        residentReply = [
          "I couldn’t match an open charge to mark as paid offline.",
          `Open payments to report Zelle/Venmo: ${residentPortalUrl("payments")}`,
        ].join("\n");
        wants = "confirm offline payment (no open charge matched)";
        break;
      }
      const channelLabel = report.channel === "venmo" ? "Venmo" : "Zelle";
      residentReply = [
        `Got it — we noted you paid via ${channelLabel} (${report.charges.length} charge${report.charges.length === 1 ? "" : "s"}).`,
        "Your manager will verify and mark them paid.",
        `Payments: ${residentPortalUrl("payments")}`,
      ].join("\n");
      autoFiledNote = `Resident reported ${channelLabel} payment on ${report.charges.length} charge(s).`;
      wants = `confirm ${channelLabel} payment received`;
      break;
    }
    case "lease": {
      threadTopic = "lease";
      residentReply = [
        "Your lease is in the resident portal.",
        `Sign / view lease: ${residentPortalUrl("lease")}`,
      ].join("\n");
      break;
    }
    case "applications": {
      residentReply = [
        "Application details live in your portal.",
        `Applications: ${residentPortalUrl("applications")}`,
        `Or apply: ${residentPortalUrl("apply")}`,
      ].join("\n");
      break;
    }
    case "move_in": {
      threadTopic = "move_in";
      residentReply = [
        "Move-in details are in your portal.",
        `Move-in: ${residentPortalUrl("move_in")}`,
      ].join("\n");
      break;
    }
    case "inbox": {
      residentReply = [
        "Got it — your property manager will see this and can reply here.",
        `Open inbox: ${residentPortalUrl("inbox")}`,
      ].join("\n");
      break;
    }
    default: {
      residentReply = residentInboundAck(args.threadTopic ?? "general");
      break;
    }
  }

  return {
    classification: { ...classification, wantsLabel: wants },
    residentReply,
    autoFiledNote,
    threadTopic,
    forwardSaid: text,
    residentName,
  };
}
