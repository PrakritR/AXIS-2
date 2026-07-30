/**
 * Record-based links between tour inquiries and resident accounts.
 * Email is used only to verify ownership at link time — never as the identity key.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { INQUIRIES_RECORD_ID } from "@/lib/tour-inquiry.server";

const RESIDENT_INBOX_SCOPE = "axis_portal_inbox_resident_v1";

type Db = SupabaseClient;

function normalizeEmail(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function textField(row: Record<string, unknown> | null | undefined, key: string): string {
  const value = row?.[key];
  return typeof value === "string" ? value.trim() : "";
}

/** Rows from the shared partner-inquiries singleton payload. */
export function inquiryRowsFromRecord(rowData: unknown): Record<string, unknown>[] {
  const payload = asObject(rowData)?.payload;
  return Array.isArray(payload) ? payload.filter((item): item is Record<string, unknown> => Boolean(asObject(item))) : [];
}

/** Load a single tour inquiry by id from the singleton record. */
export async function loadTourInquiryById(db: Db, inquiryId: string): Promise<Record<string, unknown> | null> {
  const id = inquiryId.trim();
  if (!id) return null;
  const { data, error } = await db
    .from("portal_schedule_records")
    .select("row_data")
    .eq("id", INQUIRIES_RECORD_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const rows = inquiryRowsFromRecord(data?.row_data);
  const row = rows.find((item) => textField(item, "id") === id);
  if (!row || textField(row, "kind") !== "tour") return null;
  return row;
}

export type ResidentTourLinkRow = {
  id: string;
  resident_user_id: string;
  inquiry_id: string;
  tour_group_id: string | null;
  manager_user_id: string | null;
  property_id: string | null;
  attendee_email: string;
  linked_at: string;
};

export async function loadResidentTourLinks(db: Db, userId: string): Promise<ResidentTourLinkRow[]> {
  const { data, error } = await db
    .from("resident_tour_links")
    .select("id, resident_user_id, inquiry_id, tour_group_id, manager_user_id, property_id, attendee_email, linked_at")
    .eq("resident_user_id", userId)
    .order("linked_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ResidentTourLinkRow[];
}

export async function residentHasTourLinks(db: Db, userId: string): Promise<boolean> {
  const { count, error } = await db
    .from("resident_tour_links")
    .select("id", { count: "exact", head: true })
    .eq("resident_user_id", userId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export type LinkTourInquiryResult =
  | { ok: true; linked: boolean; inquiryId: string }
  | { ok: false; status: 400 | 403 | 404; error: string };

/**
 * Link a tour inquiry to a resident account. The inquiry email must match the
 * caller's verified email — record id is the identity, email is the gate.
 */
export async function linkTourInquiryToResident(
  db: Db,
  params: {
    userId: string;
    inquiryId: string;
    email: string;
  },
): Promise<LinkTourInquiryResult> {
  const inquiryId = params.inquiryId.trim();
  const email = normalizeEmail(params.email);
  if (!inquiryId) return { ok: false, status: 400, error: "Tour inquiry id is required." };
  if (!email.includes("@")) return { ok: false, status: 400, error: "A valid email is required." };

  const inquiry = await loadTourInquiryById(db, inquiryId);
  if (!inquiry) return { ok: false, status: 404, error: "Tour inquiry not found." };

  const inquiryEmail = normalizeEmail(textField(inquiry, "email"));
  if (!inquiryEmail || inquiryEmail !== email) {
    return { ok: false, status: 403, error: "This tour is not linked to your email." };
  }

  const tourGroupId = textField(inquiry, "tourGroupId") || null;
  const managerUserId = textField(inquiry, "managerUserId") || textField(inquiry, "adminUserId") || null;
  const propertyId = textField(inquiry, "propertyId") || null;

  const { error } = await db.from("resident_tour_links").upsert(
    {
      resident_user_id: params.userId,
      inquiry_id: inquiryId,
      tour_group_id: tourGroupId,
      manager_user_id: managerUserId,
      property_id: propertyId,
      attendee_email: email,
      linked_at: new Date().toISOString(),
    },
    { onConflict: "resident_user_id,inquiry_id" },
  );
  if (error) return { ok: false, status: 400, error: error.message };

  await attachInboxThreadsToResident(db, params.userId, email);
  return { ok: true, linked: true, inquiryId };
}

/** Link every tour inquiry whose stored email matches (e.g. after account creation). */
export async function linkAllTourInquiriesForEmail(
  db: Db,
  params: { userId: string; email: string },
): Promise<string[]> {
  const email = normalizeEmail(params.email);
  if (!email.includes("@")) return [];

  const { data, error } = await db
    .from("portal_schedule_records")
    .select("row_data")
    .eq("id", INQUIRIES_RECORD_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const matching = inquiryRowsFromRecord(data?.row_data).filter(
    (row) => textField(row, "kind") === "tour" && normalizeEmail(textField(row, "email")) === email,
  );

  const linkedIds: string[] = [];
  for (const inquiry of matching) {
    const inquiryId = textField(inquiry, "id");
    if (!inquiryId) continue;
    const result = await linkTourInquiryToResident(db, {
      userId: params.userId,
      inquiryId,
      email,
    });
    if (result.ok) linkedIds.push(inquiryId);
  }
  return linkedIds;
}

/**
 * Backfill owner_user_id on inbox threads that were created before the account
 * existed (participant_email match only).
 */
export async function attachInboxThreadsToResident(db: Db, userId: string, email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  const { data: threads, error } = await db
    .from("portal_inbox_thread_records")
    .select("id, owner_user_id")
    .eq("scope", RESIDENT_INBOX_SCOPE)
    .eq("participant_email", normalized)
    .is("owner_user_id", null)
    .limit(200);
  if (error || !threads?.length) return;

  const ids = threads.map((t) => t.id).filter(Boolean);
  if (!ids.length) return;
  await db
    .from("portal_inbox_thread_records")
    .update({ owner_user_id: userId, updated_at: new Date().toISOString() })
    .in("id", ids);
}

export type ResidentTourView = {
  inquiryId: string;
  tourGroupId: string | null;
  status: string;
  propertyId: string | null;
  propertyTitle: string | null;
  roomLabel: string | null;
  managerUserId: string | null;
  managerLabel: string | null;
  proposedStart: string | null;
  proposedEnd: string | null;
  requestedWindows: Array<{ start: string; end: string }>;
  createdAt: string | null;
  confirmed: boolean;
  confirmedStart: string | null;
  confirmedEnd: string | null;
};

const PLANNED_RECORD_ID = "axis_admin_planned_events_v1";

function plannedEventsFromRecord(rowData: unknown): Record<string, unknown>[] {
  const payload = asObject(rowData)?.payload;
  return Array.isArray(payload) ? payload.filter((item): item is Record<string, unknown> => Boolean(asObject(item))) : [];
}

/** Load tour views scoped to linked inquiry ids only. */
export async function loadResidentTourViews(db: Db, userId: string): Promise<ResidentTourView[]> {
  const links = await loadResidentTourLinks(db, userId);
  if (!links.length) return [];

  const { data: inquiryRecord } = await db
    .from("portal_schedule_records")
    .select("row_data")
    .eq("id", INQUIRIES_RECORD_ID)
    .maybeSingle();
  const inquiries = inquiryRowsFromRecord(inquiryRecord?.row_data);
  const linkedIds = new Set(links.map((l) => l.inquiry_id));

  const { data: plannedRecord } = await db
    .from("portal_schedule_records")
    .select("row_data")
    .eq("id", PLANNED_RECORD_ID)
    .maybeSingle();
  const planned = plannedEventsFromRecord(plannedRecord?.row_data);

  const views: ResidentTourView[] = [];
  for (const link of links) {
    const inquiry = inquiries.find((row) => textField(row, "id") === link.inquiry_id);
    if (!inquiry) continue;

    const inquiryId = textField(inquiry, "id");
    const confirmedEvent = planned.find(
      (event) =>
        textField(event, "kind") === "tour" &&
        (textField(event, "sourceInquiryId") === inquiryId ||
          (link.tour_group_id && textField(event, "tourGroupId") === link.tour_group_id)),
    );

    const requestedWindows = Array.isArray(inquiry.requestedWindows)
      ? (inquiry.requestedWindows as unknown[])
          .map(asObject)
          .filter(Boolean)
          .map((w) => ({
            start: textField(w, "start"),
            end: textField(w, "end"),
          }))
          .filter((w) => w.start && w.end)
      : [];

    views.push({
      inquiryId,
      tourGroupId: textField(inquiry, "tourGroupId") || link.tour_group_id,
      status: confirmedEvent ? "confirmed" : textField(inquiry, "status") || "pending",
      propertyId: textField(inquiry, "propertyId") || link.property_id,
      propertyTitle: textField(inquiry, "propertyTitle") || null,
      roomLabel: textField(inquiry, "roomLabel") || null,
      managerUserId: textField(inquiry, "managerUserId") || link.manager_user_id,
      managerLabel: textField(inquiry, "adminLabel") || null,
      proposedStart: textField(inquiry, "proposedStart") || requestedWindows[0]?.start || null,
      proposedEnd: textField(inquiry, "proposedEnd") || requestedWindows[0]?.end || null,
      requestedWindows,
      createdAt: textField(inquiry, "createdAt") || link.linked_at,
      confirmed: Boolean(confirmedEvent),
      confirmedStart: confirmedEvent ? textField(confirmedEvent, "start") || null : null,
      confirmedEnd: confirmedEvent ? textField(confirmedEvent, "end") || null : null,
    });
  }
  return views;
}
