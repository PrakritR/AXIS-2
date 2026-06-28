import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecurringRentProfile } from "@/lib/household-charges";

const DIRECTIONALS = new Set(["ne", "nw", "se", "sw"]);
const STREET_TYPES = new Set(["ave", "st", "rd", "blvd", "dr", "ln", "ct", "pl"]);

function titleCasePart(part: string): string {
  if (/^\d+[a-z]?$/i.test(part)) return part.toUpperCase();
  if (/^\d+(st|nd|rd|th)$/i.test(part)) return part.toLowerCase();
  if (DIRECTIONALS.has(part.toLowerCase())) return part.toUpperCase();
  if (STREET_TYPES.has(part.toLowerCase())) {
    const lower = part.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  if (part.length <= 3) return part.toUpperCase();
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
}

/** Turn internal seed ids like mgr-seed-4709b-8th-ave-ne into readable addresses.
 *  Also handles composite "propertyId::roomLabel" format by stripping the room suffix. */
export function humanizePropertyId(propertyId: string): string {
  const trimmed = propertyId.trim();
  if (!trimmed) return "—";
  // Strip room suffix from composite IDs like "mgr-seed-4709b-8th-ave-ne::seed-4709b-room-3"
  const addressPart = trimmed.includes("::") ? (trimmed.split("::")[0]?.trim() ?? trimmed) : trimmed;
  if (!addressPart.startsWith("mgr-seed-")) return addressPart;
  const slug = addressPart.replace(/^mgr-seed-/, "");
  return slug
    .split("-")
    .filter(Boolean)
    .map(titleCasePart)
    .join(" ");
}

/** Turn internal room/unit seed labels like "seed-4709b-room-3" into "Room 3".
 *  Also handles composite "propertyId::roomLabel" by extracting the room portion. */
export function humanizeUnitLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed || trimmed === "—") return trimmed || "—";
  // Extract room portion from composite "propertyId::roomLabel" format
  const roomPart = trimmed.includes("::") ? (trimmed.split("::")[1]?.trim() ?? trimmed) : trimmed;
  // Strip seed hash prefix: "seed-4709b-room-3" → "room-3"
  const stripped = roomPart.replace(/^seed-[^-]+-/, "");
  if (!stripped) return roomPart;
  // "room-3" → "Room 3", "unit-a" → "Unit A"
  return stripped.split("-").filter(Boolean).map(titleCasePart).join(" ");
}

function normalizeEmail(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export type ManagerReportDisplayContext = {
  propertyLabel(propertyId: string | null | undefined): string;
  residentLabel(email: string | null | undefined): string;
  vendorLabel(vendorId: string | null | undefined): string;
};

export async function loadManagerReportDisplayContext(
  db: SupabaseClient,
  managerUserId: string,
): Promise<ManagerReportDisplayContext> {
  const propertyLabels = new Map<string, string>();
  const residentNames = new Map<string, string>();
  const vendorNames = new Map<string, string>();

  const [{ data: profileRows }, { data: applicationRows }, { data: vendorRows }] = await Promise.all([
    db.from("portal_recurring_rent_profile_records").select("property_id, row_data").eq("manager_user_id", managerUserId).limit(500),
    db.from("manager_application_records").select("row_data, resident_email").limit(1000),
    db.from("manager_vendor_records").select("id, row_data").eq("manager_user_id", managerUserId).limit(500),
  ]);

  for (const row of profileRows ?? []) {
    const profile = row.row_data as RecurringRentProfile | null;
    const propertyId = (row.property_id ?? profile?.propertyId ?? "").trim();
    if (propertyId) {
      const label = profile?.propertyLabel?.trim() || humanizePropertyId(propertyId);
      propertyLabels.set(propertyId, label);
    }
    const email = normalizeEmail(profile?.residentEmail);
    const name = profile?.residentName?.trim();
    if (email && name) residentNames.set(email, name);
  }

  for (const row of applicationRows ?? []) {
    const data = row.row_data as Record<string, unknown> | null;
    if (!data) continue;
    const app = data.application as Record<string, unknown> | undefined;
    const email = normalizeEmail(
      typeof row.resident_email === "string"
        ? row.resident_email
        : typeof data.email === "string"
          ? data.email
          : typeof app?.email === "string"
            ? app.email
            : "",
    );
    const name =
      (typeof app?.fullLegalName === "string" && app.fullLegalName.trim()) ||
      (typeof data.fullLegalName === "string" && data.fullLegalName.trim()) ||
      (typeof data.name === "string" && data.name.trim()) ||
      "";
    if (email && name) residentNames.set(email, name);

    const propertyId =
      (typeof data.propertyId === "string" && data.propertyId.trim()) ||
      (typeof app?.propertyId === "string" && app.propertyId.trim()) ||
      "";
    const propertyName = (typeof data.property === "string" && data.property.trim()) || "";
    if (propertyId && propertyName) propertyLabels.set(propertyId, propertyName);
  }

  for (const row of vendorRows ?? []) {
    const data = row.row_data as { id?: string; name?: string } | null;
    const id = String(row.id ?? data?.id ?? "").trim();
    const name = data?.name?.trim();
    if (id && name) vendorNames.set(id, name);
  }

  return {
    propertyLabel(propertyId) {
      const id = String(propertyId ?? "").trim();
      if (!id) return "—";
      return propertyLabels.get(id) ?? humanizePropertyId(id);
    },
    residentLabel(email) {
      const normalized = normalizeEmail(email);
      if (!normalized) return "—";
      if (residentNames.has(normalized)) return residentNames.get(normalized)!;
      if (normalized.includes("@")) {
        const local = normalized.split("@")[0] ?? normalized;
        return local
          .replace(/[._+-]+/g, " ")
          .split(" ")
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");
      }
      return humanizePropertyId(normalized);
    },
    vendorLabel(vendorId) {
      const id = String(vendorId ?? "").trim();
      if (!id) return "—";
      return vendorNames.get(id) ?? id;
    },
  };
}
