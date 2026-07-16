/**
 * Manager PropLane "agent …" command execution (mark paid, lease links, …).
 */

import "server-only";

import type { HouseholdCharge } from "@/lib/household-charges";
import {
  classifyManagerAgentCommand,
  managerAgentHelpMenuText,
  type ClassifiedManagerAgentCommand,
} from "@/lib/claw-manager-intents";
import { managerPortalUrl, residentPortalUrl } from "@/lib/claw-resident-links";
import {
  findLatestThreadForManagerPhone,
  resolveMappedManagerContacts,
  type ClawMessagingThread,
} from "@/lib/claw-resident-messaging.server";
import { cancelFuturePaymentRemindersForCharge } from "@/lib/payment-reminder-lifecycle.server";
import { syncLedgerPaymentEntry } from "@/lib/reports/ledger-sync";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { normalizeE164Us } from "@/lib/claw-messenger.server";

export type ManagerAgentActionResult = {
  classification: ClassifiedManagerAgentCommand;
  reply: string;
  /** When mark_paid succeeded, how many charges were updated. */
  markedCount?: number;
};

async function resolveManagerUserIdFromPhone(fromE164: string): Promise<string | null> {
  const managers = await resolveMappedManagerContacts();
  const hit = managers.find((m) => m.personalPhone === fromE164);
  if (hit?.userId) return hit.userId;

  const db = createSupabaseServiceRoleClient();
  const { data } = await db
    .from("profiles")
    .select("id")
    .eq("phone", fromE164)
    .in("role", ["manager", "pro", "admin", "owner"])
    .limit(1)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

type ResidentMatch = {
  email: string;
  name: string;
  phone: string | null;
  userId: string | null;
};

function scoreResidentMatch(hint: string, candidate: ResidentMatch): number {
  const h = hint.trim().toLowerCase();
  if (!h) return 0;
  const email = candidate.email.toLowerCase();
  const name = candidate.name.toLowerCase();
  const phoneDigits = (candidate.phone ?? "").replace(/\D/g, "");
  const hintDigits = h.replace(/\D/g, "");

  if (email && email === h) return 100;
  if (email && email.includes(h)) return 90;
  if (name && name === h) return 95;
  if (name && (name.includes(h) || h.split(/\s+/).every((p) => name.includes(p)))) return 80;
  if (hintDigits.length >= 7 && phoneDigits.includes(hintDigits)) return 85;
  if (hintDigits.length >= 4 && phoneDigits.endsWith(hintDigits)) return 70;
  return 0;
}

async function listManagerResidents(managerUserId: string): Promise<ResidentMatch[]> {
  const db = createSupabaseServiceRoleClient();
  const byEmail = new Map<string, ResidentMatch>();

  const { data: apps } = await db
    .from("manager_application_records")
    .select("resident_email, row_data")
    .eq("manager_user_id", managerUserId)
    .limit(200);
  for (const row of apps ?? []) {
    const email = String(row.resident_email ?? "").trim().toLowerCase();
    if (!email.includes("@")) continue;
    const rd = (row.row_data ?? {}) as {
      name?: string;
      application?: { phone?: string; fullLegalName?: string };
    };
    const name =
      String(rd.name ?? "").trim() ||
      String(rd.application?.fullLegalName ?? "").trim() ||
      email.split("@")[0] ||
      "Resident";
    const phone = String(rd.application?.phone ?? "").trim() || null;
    byEmail.set(email, { email, name, phone, userId: null });
  }

  const { data: charges } = await db
    .from("portal_household_charge_records")
    .select("resident_email, resident_user_id, row_data")
    .eq("manager_user_id", managerUserId)
    .limit(300);
  for (const row of charges ?? []) {
    const email = String(row.resident_email ?? "").trim().toLowerCase();
    if (!email.includes("@")) continue;
    const rd = (row.row_data ?? {}) as { residentName?: string };
    const existing = byEmail.get(email);
    const name = String(rd.residentName ?? "").trim() || existing?.name || email.split("@")[0] || "Resident";
    byEmail.set(email, {
      email,
      name,
      phone: existing?.phone ?? null,
      userId: row.resident_user_id ? String(row.resident_user_id) : existing?.userId ?? null,
    });
  }

  // Fill phones from profiles when we have emails.
  const emails = [...byEmail.keys()];
  if (emails.length > 0) {
    const { data: profiles } = await db
      .from("profiles")
      .select("id, email, phone, full_name")
      .in("email", emails);
    for (const p of profiles ?? []) {
      const email = String(p.email ?? "").trim().toLowerCase();
      const cur = byEmail.get(email);
      if (!cur) continue;
      byEmail.set(email, {
        ...cur,
        userId: cur.userId || (p.id ? String(p.id) : null),
        phone: cur.phone || String(p.phone ?? "").trim() || null,
        name: cur.name !== email.split("@")[0] ? cur.name : String(p.full_name ?? "").trim() || cur.name,
      });
    }
  }

  return [...byEmail.values()];
}

async function resolveResidentForCommand(args: {
  managerUserId: string;
  hint: string | null;
  thread: ClawMessagingThread | null;
}): Promise<{ ok: true; resident: ResidentMatch } | { ok: false; reply: string }> {
  const residents = await listManagerResidents(args.managerUserId);
  const hint = args.hint?.trim() || null;

  if (!hint) {
    if (args.thread?.residentEmail) {
      const email = args.thread.residentEmail.trim().toLowerCase();
      const fromList = residents.find((r) => r.email === email);
      if (fromList) return { ok: true, resident: fromList };
      return {
        ok: true,
        resident: {
          email,
          name: "Resident",
          phone: args.thread.residentPhone || null,
          userId: args.thread.residentUserId || null,
        },
      };
    }
    return {
      ok: false,
      reply: [
        "Which resident? Try:",
        "AGENT mark payment for <name> paid",
        "Or open a resident thread first, then: AGENT mark paid",
      ].join("\n"),
    };
  }

  const scored = residents
    .map((r) => ({ r, score: scoreResidentMatch(hint, r) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      ok: false,
      reply: `Couldn't match a resident for "${hint}". Try their full name or email.`,
    };
  }
  if (scored.length > 1 && scored[0]!.score === scored[1]!.score) {
    const options = scored
      .slice(0, 5)
      .map((x) => `• ${x.r.name} <${x.r.email}>`)
      .join("\n");
    return {
      ok: false,
      reply: [`Several residents match "${hint}":`, options, "Be more specific."].join("\n"),
    };
  }
  return { ok: true, resident: scored[0]!.r };
}

async function listPendingCharges(args: {
  managerUserId: string;
  residentEmail: string;
}): Promise<HouseholdCharge[]> {
  const db = createSupabaseServiceRoleClient();
  const { data } = await db
    .from("portal_household_charge_records")
    .select("row_data, status")
    .eq("manager_user_id", args.managerUserId)
    .eq("resident_email", args.residentEmail.trim().toLowerCase())
    .in("status", ["pending", "partially_paid", "failed"])
    .order("updated_at", { ascending: false })
    .limit(40);
  const out: HouseholdCharge[] = [];
  for (const row of data ?? []) {
    const charge = (row as { row_data?: HouseholdCharge }).row_data;
    if (!charge?.id) continue;
    if (charge.status === "paid" || charge.status === "processing") continue;
    out.push(charge);
  }
  return out;
}

async function markChargesPaid(args: {
  managerUserId: string;
  charges: HouseholdCharge[];
}): Promise<HouseholdCharge[]> {
  const db = createSupabaseServiceRoleClient();
  const now = new Date().toISOString();
  const marked: HouseholdCharge[] = [];

  for (const charge of args.charges) {
    const nextCharge: HouseholdCharge = {
      ...charge,
      status: "paid",
      paidAt: now,
      balanceLabel: "$0.00",
      managerUserId: charge.managerUserId || args.managerUserId,
    };
    const { error } = await db.from("portal_household_charge_records").upsert(
      {
        id: charge.id,
        manager_user_id: args.managerUserId,
        resident_user_id: charge.residentUserId ?? null,
        resident_email: (charge.residentEmail ?? "").trim().toLowerCase() || null,
        property_id: charge.propertyId ?? null,
        kind: charge.kind ?? null,
        status: "paid",
        row_data: nextCharge,
        updated_at: now,
      },
      { onConflict: "id" },
    );
    if (error) continue;
    marked.push(nextCharge);
    await syncLedgerPaymentEntry(db, nextCharge, now).catch(() => undefined);
    await cancelFuturePaymentRemindersForCharge(db, args.managerUserId, charge.id).catch(() => undefined);
  }
  return marked;
}

function formatChargeLine(c: HouseholdCharge): string {
  const title = c.title?.trim() || "Charge";
  const bal = (c.balanceLabel || c.amountLabel || "").trim() || "—";
  const due = c.dueDateLabel?.trim() ? ` · due ${c.dueDateLabel.trim()}` : "";
  return `• ${title} — ${bal}${due}`;
}

export async function runManagerAgentCommand(args: {
  fromPhone: string;
  text: string;
}): Promise<ManagerAgentActionResult | null> {
  const from = normalizeE164Us(args.fromPhone);
  if (!from) return null;

  const classification = classifyManagerAgentCommand(args.text);
  if (!classification.isCommand) return null;

  const managerUserId = await resolveManagerUserIdFromPhone(from);
  if (!managerUserId) {
    return {
      classification,
      reply: "Couldn't match your phone to a manager account. Verify your personal phone in Settings.",
    };
  }

  const thread = await findLatestThreadForManagerPhone(from);

  if (classification.intent === "help") {
    return { classification, reply: managerAgentHelpMenuText() };
  }

  if (classification.intent === "unknown") {
    return {
      classification,
      reply: ["I didn't catch that command.", "", managerAgentHelpMenuText()].join("\n"),
    };
  }

  const resolved = await resolveResidentForCommand({
    managerUserId,
    hint: classification.residentHint,
    thread,
  });
  if (!resolved.ok) {
    return { classification, reply: resolved.reply };
  }
  const resident = resolved.resident;

  if (classification.intent === "lease_link") {
    const leaseUrl = residentPortalUrl("lease");
    const managerLeases = managerPortalUrl("leases");
    return {
      classification,
      reply: [
        `Lease for ${resident.name} <${resident.email}>`,
        `Resident lease link: ${leaseUrl}`,
        `Your leases tab: ${managerLeases}`,
      ].join("\n"),
    };
  }

  if (classification.intent === "payments") {
    const charges = await listPendingCharges({
      managerUserId,
      residentEmail: resident.email,
    });
    if (charges.length === 0) {
      return {
        classification,
        reply: `No open charges for ${resident.name} (${resident.email}).`,
      };
    }
    return {
      classification,
      reply: [
        `Open charges for ${resident.name}:`,
        ...charges.slice(0, 8).map(formatChargeLine),
        charges.length > 8 ? `…and ${charges.length - 8} more` : null,
        `Mark paid: AGENT mark payment for ${resident.name} paid`,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  if (classification.intent === "mark_paid") {
    const charges = await listPendingCharges({
      managerUserId,
      residentEmail: resident.email,
    });
    if (charges.length === 0) {
      return {
        classification,
        reply: `No open charges to mark paid for ${resident.name} (${resident.email}).`,
      };
    }
    const marked = await markChargesPaid({ managerUserId, charges });
    if (marked.length === 0) {
      return {
        classification,
        reply: `Couldn't update charges for ${resident.name}. Try again from the portal Payments tab.`,
      };
    }
    return {
      classification,
      markedCount: marked.length,
      reply: [
        `Marked ${marked.length} charge${marked.length === 1 ? "" : "s"} paid for ${resident.name}:`,
        ...marked.slice(0, 6).map(formatChargeLine),
        `Payments: ${managerPortalUrl("payments")}`,
      ].join("\n"),
    };
  }

  return {
    classification,
    reply: managerAgentHelpMenuText(),
  };
}
