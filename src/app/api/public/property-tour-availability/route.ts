import { NextResponse } from "next/server";
import {
  GOOGLE_CALENDAR_EVENT_LIST_BUDGET_MS,
  GOOGLE_CALENDAR_FETCH_TIMEOUT_MS,
  listGoogleCalendarEvents,
} from "@/lib/google-calendar/api.server";
import { googleEventBlocksTours } from "@/lib/google-calendar/busy";
import { publicSchedulingHostLabel } from "@/lib/public-host-label";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import {
  buildDefaultTourSlotKeys,
  DEFAULT_TOUR_HORIZON_DAYS,
  payloadSlots,
  rowPayload,
  safePropertyId,
  shouldOfferDefaultTourGrid,
  slotBlocked,
  slotIsBookable,
  slotStartMs,
  windowsFromPayload,
  type TourBlock,
} from "@/lib/tour-slot-math";

export const runtime = "nodejs";

/**
 * What a prospect is offered:
 *
 *     offered = (published availability, or the 9-5 default when none is
 *                published) MINUS calendar-busy MINUS already-booked
 *
 * All three terms are load-bearing. Dropping the subtraction is how the same
 * half hour got sold to three prospects: a confirmed tour left its own slot on
 * offer and the manager's linked-calendar busy time was never consulted at all.
 */

/**
 * Google busy windows are cached in-process because this route is public and
 * uncached at the edge (see the response headers below) — without this, anyone
 * could drive unbounded Google Calendar API calls by reloading a booking page.
 * Short enough that a manager blocking their morning takes effect within a
 * minute; PropLane's OWN bookings are never served from here, so this TTL can
 * not resurrect a slot that was just booked.
 */
const GOOGLE_BUSY_TTL_MS = 60_000;
/** Hard ceiling on distinct managers held at once; the map is module-global. */
const GOOGLE_BUSY_CACHE_MAX_ENTRIES = 500;
const googleBusyCache = new Map<string, { expiresAt: number; windowEndMs: number; blocks: TourBlock[] }>();

/**
 * Store a manager's busy blocks, sweeping expired entries first. Without this
 * the map only ever grew: an entry is overwritten only if that same manager is
 * asked for again, so a long-lived instance accumulated every manager ever
 * queried. The FIFO trim after the sweep bounds the pathological case where
 * every entry is still live.
 */
function cacheGoogleBusyBlocks(managerUserId: string, blocks: TourBlock[], windowEndMs: number): void {
  const now = Date.now();
  for (const [key, entry] of googleBusyCache) {
    if (entry.expiresAt <= now) googleBusyCache.delete(key);
  }
  googleBusyCache.set(managerUserId, { expiresAt: now + GOOGLE_BUSY_TTL_MS, windowEndMs, blocks });
  while (googleBusyCache.size > GOOGLE_BUSY_CACHE_MAX_ENTRIES) {
    const oldest = googleBusyCache.keys().next();
    if (oldest.done) break;
    googleBusyCache.delete(oldest.value);
  }
}

/**
 * Ceiling on one manager's busy read, covering the token hop and every page.
 * Above the library's own budget so this only ever fires for a genuine stall.
 */
const GOOGLE_BUSY_READ_BUDGET_MS = GOOGLE_CALENDAR_EVENT_LIST_BUDGET_MS + GOOGLE_CALENDAR_FETCH_TIMEOUT_MS + 2_000;

/** Reject once `budgetMs` has passed, so a stalled call cannot hold the response. */
function withDeadline<T>(work: Promise<T>, budgetMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Google Calendar did not respond in time.")), budgetMs);
  });
  return Promise.race([work, deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

/**
 * How far ahead to read Google busy time.
 *
 * The invariant: calendar-busy time is subtracted across the ENTIRE range of
 * slots this response can offer, never a shorter one. `DEFAULT_TOUR_HORIZON_DAYS`
 * bounds only the DEFAULT grid — published availability is not bounded by it at
 * all, so a manager who paints a week six weeks out would otherwise get their
 * busy morning bookable again past the default horizon, which is the exact
 * double-booking defect this route exists to close.
 */
function googleBusyWindowEndMs(offeredSlots: readonly string[], now: number = Date.now()): number {
  const defaultEnd = now + DEFAULT_TOUR_HORIZON_DAYS * 24 * 60 * 60 * 1000;
  let furthest = defaultEnd;
  for (const slot of offeredSlots) {
    const startMs = slotStartMs(slot);
    if (startMs === null) continue;
    // The slot's own half hour has to be inside the window, not just its start.
    const slotEnd = startMs + 30 * 60 * 1000;
    if (slotEnd > furthest) furthest = slotEnd;
  }
  return furthest;
}

/**
 * A cached entry is only reusable for a window it actually COVERS — an entry
 * fetched for a 21-day read would otherwise be served to a request offering
 * slots three months out, silently un-subtracting the tail.
 */
async function googleBusyBlocks(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  managerUserId: string,
  timeMin: string,
  timeMax: string,
): Promise<TourBlock[]> {
  const windowEndMs = Date.parse(timeMax);
  const cached = googleBusyCache.get(managerUserId);
  if (cached && cached.expiresAt > Date.now() && cached.windowEndMs >= windowEndMs) return cached.blocks;
  let blocks: TourBlock[] = [];
  try {
    // A whole-operation deadline on top of the per-hop ones: this route is
    // PUBLIC and uncached, so a slow Google must never stretch a prospect's
    // booking page. Timing out contributes no busy time, exactly like a broken
    // link — the tradeoff the fail-open policy below already accepts.
    const events = await withDeadline(
      listGoogleCalendarEvents(db, managerUserId, timeMin, timeMax),
      GOOGLE_BUSY_READ_BUDGET_MS,
    );
    blocks = events
      .filter(googleEventBlocksTours)
      .map((event) => ({ start: event.start, end: event.end }));
  } catch {
    // Not linked, revoked, quota, API disabled — a manager without a working
    // calendar link simply contributes no busy time. Never fail the whole
    // availability read over one manager's integration.
    blocks = [];
  }
  cacheGoogleBusyBlocks(managerUserId, blocks, windowEndMs);
  return blocks;
}

type ScheduleRecordRow = {
  id: string | null;
  manager_user_id: string | null;
  property_id: string | null;
  record_type: string | null;
  row_data: unknown;
};

type PropertyManagerEntry = {
  userId: string;
  label: string;
  propertyId?: string;
};

type PropertyRecordRow = {
  manager_user_id: string | null;
  status: string | null;
  property_data: unknown;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function textField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value.trim() : "";
}

function propertyMatchKey(row: Record<string, unknown>): string {
  return `${textField(row, "buildingName")}::${textField(row, "address")}`.toLowerCase();
}

function houseKeyFromParts(buildingName: string | null | undefined, address: string | null | undefined): string {
  return `${String(buildingName ?? "").trim()}::${String(address ?? "").trim()}`.toLowerCase();
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId")?.trim();
    if (!propertyId) return NextResponse.json({ error: "propertyId required" }, { status: 400 });
    const requestedHouseKey = houseKeyFromParts(searchParams.get("buildingName"), searchParams.get("address"));

    const safeId = safePropertyId(propertyId);
    const db = createSupabaseServiceRoleClient();

    const { data: directPropertyRow, error: directPropertyError } = await db
      .from("manager_property_records")
      .select("manager_user_id, status, property_data")
      .eq("id", propertyId)
      .maybeSingle();

    if (directPropertyError) return NextResponse.json({ error: directPropertyError.message }, { status: 500 });

    let propertyRecords: { managerUserId: string; status: string; property: Record<string, unknown> }[] = [];
    if (directPropertyRow?.property_data && typeof directPropertyRow.property_data === "object") {
      const managerUserId = directPropertyRow.manager_user_id?.trim() ?? "";
      if (managerUserId) {
        propertyRecords = [{
          managerUserId,
          status: directPropertyRow.status?.trim().toLowerCase() ?? "",
          property: directPropertyRow.property_data as Record<string, unknown>,
        }];
      }
    }

    if (propertyRecords.length === 0 && requestedHouseKey !== "::") {
      const { data: liveRows, error: propertyError } = await db
        .from("manager_property_records")
        .select("manager_user_id, status, property_data")
        .eq("status", "live")
        .limit(200);

      if (propertyError) return NextResponse.json({ error: propertyError.message }, { status: 500 });

      propertyRecords = ((liveRows ?? []) as PropertyRecordRow[])
        .map((row) => ({
          managerUserId: row.manager_user_id?.trim() ?? "",
          status: row.status?.trim().toLowerCase() ?? "",
          property: asObject(row.property_data),
        }))
        .filter((row): row is { managerUserId: string; status: string; property: Record<string, unknown> } =>
          Boolean(row.managerUserId && row.property && propertyMatchKey(row.property) === requestedHouseKey),
        );
    }

    if (propertyRecords.length === 0) {
      // Same no-store reasoning as the main response: an unresolved property is
      // often one that just went live, and a cached empty grid keeps it dead.
      return NextResponse.json({ slotHosts: {} }, { headers: { "Cache-Control": "no-store" } });
    }

    const directMatches = propertyRecords.filter(({ property }) => {
      const id = textField(property, "id");
      const buildingId = textField(property, "buildingId");
      const key = propertyMatchKey(property);
      return (
        id === propertyId ||
        safePropertyId(id) === safeId ||
        buildingId === propertyId ||
        safePropertyId(buildingId) === safeId ||
        (requestedHouseKey !== "::" && key === requestedHouseKey)
      );
    });
    const houseKeys = new Set(directMatches.map(({ property }) => propertyMatchKey(property)).filter(Boolean));
    const matchingPropertyRecords = propertyRecords.filter(
      ({ property }) => directMatches.some((match) => match.property === property) || houseKeys.has(propertyMatchKey(property)),
    );
    const managerIds = [
      ...new Set(
        matchingPropertyRecords.map(({ managerUserId }) => managerUserId),
      ),
    ];
    const propertyIdsByManager = new Map<string, Set<string>>();
    const requestedPropertyIds = new Set([propertyId, safeId].filter(Boolean));
    for (const { managerUserId, property } of matchingPropertyRecords) {
      const ids = propertyIdsByManager.get(managerUserId) ?? new Set<string>();
      for (const value of [textField(property, "id"), textField(property, "buildingId")]) {
        if (!value) continue;
        ids.add(value);
        ids.add(safePropertyId(value));
        requestedPropertyIds.add(value);
        requestedPropertyIds.add(safePropertyId(value));
      }
      propertyIdsByManager.set(managerUserId, ids);
    }

    const propertyAvailabilityRows = await db
      .from("portal_schedule_records")
      .select("id, manager_user_id, property_id, record_type, row_data")
      .eq("record_type", "manager_property_availability");

    if (propertyAvailabilityRows.error) {
      return NextResponse.json({ error: propertyAvailabilityRows.error.message }, { status: 500 });
    }

    const { data: globalData, error } = await db
      .from("portal_schedule_records")
      .select("id, manager_user_id, property_id, record_type, row_data")
      .eq("record_type", "manager_availability")
      .in("manager_user_id", managerIds.length > 0 ? managerIds : ["__none__"]);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const propertyRowsForHouse = ((propertyAvailabilityRows.data ?? []) as ScheduleRecordRow[]).filter((row) => {
      const managerUserId = row.manager_user_id?.trim();
      if (!managerUserId) return false;
      const propertyIds = propertyIdsByManager.get(managerUserId);
      const rowPropertyId = row.property_id?.trim() ?? "";
      const safeRowPropertyId = safePropertyId(rowPropertyId);
      const rowId = row.id?.trim() ?? "";
      const directPropertyMatch =
        requestedPropertyIds.has(rowPropertyId) ||
        requestedPropertyIds.has(safeRowPropertyId) ||
        [...requestedPropertyIds].some((propertyKey) => rowId.includes(`_prop_${propertyKey}`));
      if (directPropertyMatch) return true;
      if (!propertyIds || propertyIds.size === 0) return false;
      return (
        propertyIds.has(rowPropertyId) ||
        propertyIds.has(safeRowPropertyId) ||
        [...propertyIds].some((propertyKey) => rowId.includes(`_prop_${propertyKey}`))
      );
    });
    const globalRows = ((globalData ?? []) as ScheduleRecordRow[]).filter((row) => {
      const managerUserId = row.manager_user_id?.trim();
      return managerUserId && !propertyRowsForHouse.some((propertyRow) => propertyRow.manager_user_id === managerUserId);
    });
    const rows = [...propertyRowsForHouse, ...globalRows];

    /**
     * One manager's offering for this property. Published rows become offerings
     * verbatim; when NOTHING is published the property still offers the default
     * 9-5 grid, so a manager who has not opened their calendar yet does not show
     * a prospect a dead booking page. Either way the subtraction below applies.
     */
    type Offering = { managerUserId: string; propertyId?: string; slots: string[] };
    const publishedOfferings: Offering[] = rows
      .map((row) => ({
        managerUserId: row.manager_user_id?.trim() ?? "",
        propertyId: row.property_id?.trim() || undefined,
        slots: payloadSlots(row.row_data),
      }))
      .filter((offering) => offering.managerUserId);

    const publishedFutureSlots = publishedOfferings.flatMap((offering) =>
      offering.slots.filter((slot) => slotIsBookable(slot)),
    );
    const offerings: Offering[] = !shouldOfferDefaultTourGrid(publishedFutureSlots)
      ? publishedOfferings
      : [...new Set(matchingPropertyRecords.map(({ managerUserId }) => managerUserId))]
          .filter(Boolean)
          .map((managerUserId) => ({
            managerUserId,
            propertyId: [...(propertyIdsByManager.get(managerUserId) ?? [])][0] ?? propertyId,
            slots: buildDefaultTourSlotKeys(),
          }));

    const availabilityManagerIds = [...new Set(offerings.map((offering) => offering.managerUserId))];
    const blockedSlotsByManager = new Map<string, TourBlock[]>();
    if (availabilityManagerIds.length > 0) {
      const { data: pendingRows, error: pendingError } = await db
        .from("portal_schedule_records")
        .select("manager_user_id, row_data")
        .eq("record_type", "partner_inquiry_request")
        .in("manager_user_id", availabilityManagerIds);

      if (pendingError) return NextResponse.json({ error: pendingError.message }, { status: 500 });

      for (const pending of (pendingRows ?? []) as ScheduleRecordRow[]) {
        const managerUserId = pending.manager_user_id?.trim();
        const payload = rowPayload(pending.row_data);
        if (!managerUserId || !payload) continue;
        if (textField(payload, "status").toLowerCase() !== "pending") continue;
        const blocks = blockedSlotsByManager.get(managerUserId) ?? [];
        blocks.push(...windowsFromPayload(payload));
        blockedSlotsByManager.set(managerUserId, blocks);
      }

      const { data: plannedRow, error: plannedError } = await db
        .from("portal_schedule_records")
        .select("row_data")
        .eq("id", "axis_admin_planned_events_v1")
        .maybeSingle();

      if (plannedError) return NextResponse.json({ error: plannedError.message }, { status: 500 });

      const plannedPayload = asObject(plannedRow?.row_data)?.payload;
      const plannedEvents = Array.isArray(plannedPayload) ? plannedPayload.map(asObject).filter(Boolean) : [];
      for (const event of plannedEvents as Record<string, unknown>[]) {
        if (textField(event, "kind") !== "tour") continue;
        const managerUserId = textField(event, "managerUserId");
        if (!managerUserId || !availabilityManagerIds.includes(managerUserId)) continue;
        const start = textField(event, "start");
        const end = textField(event, "end");
        if (!start || !end) continue;
        const blocks = blockedSlotsByManager.get(managerUserId) ?? [];
        blocks.push({ start, end, slotKey: textField(event, "slotKey") || undefined });
        blockedSlotsByManager.set(managerUserId, blocks);
      }

      // Calendar-busy time. The manager's linked Google Calendar is the other
      // half of "already booked" — the product's own copy promises the blocked
      // time is honoured "so tour availability stays accurate", and until now
      // this route never read it, so a manager's busy morning stayed bookable.
      const busyWindowMin = new Date().toISOString();
      const busyWindowMax = new Date(googleBusyWindowEndMs(offerings.flatMap((o) => o.slots))).toISOString();
      const busyByManager = await Promise.all(
        availabilityManagerIds.map(async (managerUserId) => ({
          managerUserId,
          blocks: await googleBusyBlocks(db, managerUserId, busyWindowMin, busyWindowMax),
        })),
      );
      for (const { managerUserId, blocks: busy } of busyByManager) {
        if (busy.length === 0) continue;
        const blocks = blockedSlotsByManager.get(managerUserId) ?? [];
        blocks.push(...busy);
        blockedSlotsByManager.set(managerUserId, blocks);
      }
    }

    const labelByManagerId = new Map<string, string>();
    if (availabilityManagerIds.length > 0) {
      const { data: profiles } = await db.from("profiles").select("id, email, full_name").in("id", availabilityManagerIds);
      for (const profile of (profiles ?? []) as { id?: string | null; email?: string | null; full_name?: string | null }[]) {
        if (!profile.id) continue;
        labelByManagerId.set(
          profile.id,
          publicSchedulingHostLabel({ email: profile.email, fullName: profile.full_name }),
        );
      }
    }

    const slotHosts: Record<string, PropertyManagerEntry[]> = {};
    for (const offering of offerings) {
      const managerUserId = offering.managerUserId;
      const host = {
        userId: managerUserId,
        label: labelByManagerId.get(managerUserId) ?? "Property manager",
        propertyId: offering.propertyId,
      };
      for (const slot of offering.slots) {
        if (!slotIsBookable(slot)) continue;
        if (slotBlocked(slot, blockedSlotsByManager.get(managerUserId) ?? [])) continue;
        const hosts = slotHosts[slot] ?? [];
        if (!hosts.some((item) => item.userId === host.userId)) {
          hosts.push(host);
        }
        slotHosts[slot] = hosts;
      }
    }

    // NOT edge-cached, deliberately, against this repo's usual prefer-caching
    // rule. `s-maxage=300, stale-while-revalidate=600` meant a slot booked
    // seconds ago stayed on offer for up to fifteen minutes, and a manager who
    // published a window watched the page ignore it for five — both reported.
    // A double-booked tour costs more than the egress. Repeat load is absorbed
    // instead by the in-process Google busy cache above.
    return NextResponse.json({ slotHosts }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load property tour availability.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
