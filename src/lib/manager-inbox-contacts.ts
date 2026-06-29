import type { InboxScopedContact } from "@/data/inbox-scoped-directory";
import { PRIMARY_AXIS_ADMIN_EMAIL, PRIMARY_AXIS_ADMIN_LABEL } from "@/data/inbox-scoped-directory";
import { readManagerApplicationRows } from "@/lib/manager-applications-storage";
import { readProRelationships } from "@/lib/pro-relationships";

/** Approved residents + linked co-managers for manager inbox / schedule compose. */
export function buildManagerInboxLiveContacts(userId: string | null | undefined): InboxScopedContact[] {
  const out: InboxScopedContact[] = [];
  const seen = new Set<string>();

  for (const row of readManagerApplicationRows()) {
    if (row.bucket !== "approved" || !row.email?.trim()) continue;
    const email = row.email.trim().toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    const propertyLabel = row.property?.trim() || undefined;
    const propertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || undefined;
    out.push({
      id: `res-${row.id}`,
      name: row.name || row.email.trim(),
      email: row.email.trim(),
      role: "resident",
      propertyLabel,
      propertyId,
    });
  }

  if (userId) {
    for (const rel of readProRelationships(userId)) {
      const email = rel.linkedAxisId.trim();
      if (!email || seen.has(email.toLowerCase())) continue;
      seen.add(email.toLowerCase());
      out.push({
        id: `rel-${rel.id}`,
        name: rel.linkedDisplayName || rel.linkedAxisId,
        email: rel.linkedAxisId,
        role: "manager",
      });
    }
  }

  return out;
}

export function axisAdminScheduleContact(): InboxScopedContact {
  return {
    id: "axis-admin",
    name: PRIMARY_AXIS_ADMIN_LABEL,
    email: PRIMARY_AXIS_ADMIN_EMAIL,
    role: "manager",
  };
}

export function propertyOptionsFromContacts(contacts: InboxScopedContact[]): { id: string; label: string }[] {
  const byId = new Map<string, string>();
  for (const contact of contacts) {
    if (contact.role !== "resident") continue;
    const id = contact.propertyId?.trim();
    if (!id) continue;
    const label = contact.propertyLabel?.trim() || id;
    if (!byId.has(id)) byId.set(id, label);
  }
  return [...byId.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

export function residentsForProperty(contacts: InboxScopedContact[], propertyId: string | null): InboxScopedContact[] {
  const residents = contacts.filter((c) => c.role === "resident");
  if (!propertyId) return residents;
  return residents.filter((c) => c.propertyId === propertyId);
}
