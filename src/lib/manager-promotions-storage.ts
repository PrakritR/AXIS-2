/**
 * Client store for manager promotions (AI flyers). Mirrors the vendor-store
 * pattern: an in-memory + sessionStorage cache, a TTL/in-flight-guarded server
 * sync through the scoped /api/portal-promotions route, and a change event panels
 * subscribe to. Demo mode never touches the network (seeded locally).
 */
import { isDemoModeActive } from "@/lib/demo/demo-session";
import {
  composeFallbackFlyerCopy,
  type FlyerCopy,
  type ManagerPromotionRow,
  type PromotionInputs,
} from "@/lib/promotion-flyer";
import {
  composeFallbackPromotionText,
  type PromotionTextCopy,
  type PromotionTextFormat,
} from "@/lib/promotion-text";

export type { ManagerPromotionRow } from "@/lib/promotion-flyer";

export const MANAGER_PROMOTIONS_EVENT = "axis:manager-promotions";
const MANAGER_PROMOTIONS_SESSION_KEY = "axis:manager-promotions:v1";
const MANAGER_PROMOTIONS_SYNC_TTL_MS = 15_000;

const EMPTY_FALLBACK: ManagerPromotionRow[] = [];
let memoryRows: ManagerPromotionRow[] = [];
let lastSyncedAt = 0;
let syncPromise: Promise<ManagerPromotionRow[]> | null = null;

function canUseStorage() {
  return typeof window !== "undefined";
}

function rowsChanged(a: ManagerPromotionRow[], b: ManagerPromotionRow[]) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function hydrateFromSession() {
  if (!canUseStorage() || memoryRows.length > 0) return;
  try {
    const raw = window.sessionStorage.getItem(MANAGER_PROMOTIONS_SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as ManagerPromotionRow[];
    if (Array.isArray(parsed)) memoryRows = parsed;
  } catch {
    /* ignore */
  }
}

function persistToSession(rows: ManagerPromotionRow[]) {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.setItem(MANAGER_PROMOTIONS_SESSION_KEY, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

function emit() {
  if (!canUseStorage()) return;
  window.dispatchEvent(new Event(MANAGER_PROMOTIONS_EVENT));
}

function mirrorRowToServer(row: ManagerPromotionRow) {
  if (typeof window === "undefined" || isDemoModeActive()) return;
  void fetch("/api/portal-promotions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "upsert", row }),
  }).catch(() => undefined);
}

function deleteFromServer(id: string) {
  if (typeof window === "undefined" || isDemoModeActive()) return;
  void fetch("/api/portal-promotions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "delete", id }),
  }).catch(() => undefined);
}

export function makePromotionId(): string {
  return `promo-${crypto.randomUUID()}`;
}

export async function syncManagerPromotionsFromServer(opts?: { force?: boolean }): Promise<ManagerPromotionRow[]> {
  if (!canUseStorage()) return [];
  hydrateFromSession();
  if (isDemoModeActive()) return readManagerPromotionRows();
  const force = opts?.force === true;
  if (!force && syncPromise) return syncPromise;
  if (!force && lastSyncedAt > 0 && Date.now() - lastSyncedAt < MANAGER_PROMOTIONS_SYNC_TTL_MS) {
    return readManagerPromotionRows();
  }
  try {
    syncPromise = (async () => {
      const res = await fetch("/api/portal-promotions", { credentials: "include" });
      if (!res.ok) return readManagerPromotionRows();
      const body = (await res.json()) as { rows?: ManagerPromotionRow[] };
      const rows = Array.isArray(body.rows) ? body.rows : [];
      const changed = rowsChanged(memoryRows, rows);
      memoryRows = rows;
      persistToSession(rows);
      lastSyncedAt = Date.now();
      if (changed) emit();
      return rows;
    })();
    return await syncPromise;
  } catch {
    return readManagerPromotionRows();
  } finally {
    syncPromise = null;
  }
}

export function readManagerPromotionRows(fallback: ManagerPromotionRow[] = EMPTY_FALLBACK): ManagerPromotionRow[] {
  hydrateFromSession();
  if (memoryRows.length === 0) return [...fallback];
  return memoryRows;
}

/** Demo seed: load rows into the local store without a server mirror. */
export function seedDemoManagerPromotionRows(rows: ManagerPromotionRow[]): void {
  if (!canUseStorage()) return;
  memoryRows = rows;
  persistToSession(rows);
  lastSyncedAt = Date.now();
  emit();
}

function writeRows(rows: ManagerPromotionRow[]) {
  if (!rowsChanged(memoryRows, rows)) return;
  memoryRows = rows;
  persistToSession(rows);
  lastSyncedAt = Date.now();
  emit();
}

export function upsertManagerPromotion(row: ManagerPromotionRow): void {
  const rows = readManagerPromotionRows();
  const idx = rows.findIndex((r) => r.id === row.id);
  const next = idx === -1 ? [...rows, row] : rows.map((r, i) => (i === idx ? row : r));
  writeRows(next);
  mirrorRowToServer(row);
}

export function deleteManagerPromotionRow(id: string): boolean {
  const rows = readManagerPromotionRows();
  if (!rows.some((r) => r.id === id)) return false;
  writeRows(rows.filter((r) => r.id !== id));
  deleteFromServer(id);
  return true;
}

export function subscribeManagerPromotions(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(MANAGER_PROMOTIONS_EVENT, cb);
  return () => window.removeEventListener(MANAGER_PROMOTIONS_EVENT, cb);
}

/**
 * Generate flyer copy. Calls the server AI route (which keeps the Anthropic key
 * server-side, traces the call, and guards cost); on any failure — demo mode,
 * offline, missing API key, or 401 — it degrades to deterministic local copy so
 * the feature always produces a flyer.
 */
export async function generateFlyerCopy(
  inputs: PromotionInputs,
  propertyLabel: string,
  opts?: { propertyId?: string | null; extraInstructions?: string },
): Promise<{ copy: FlyerCopy; source: "ai" | "fallback" | "forbidden" }> {
  const propertyId = opts?.propertyId ?? null;
  const extraInstructions = opts?.extraInstructions ?? "";
  if (isDemoModeActive() || typeof window === "undefined") {
    return { copy: composeFallbackFlyerCopy(inputs, propertyLabel), source: "fallback" };
  }
  try {
    // Uploaded photos are embedded into the flyer HTML client-side; never ship
    // the (large) data URLs to the copy-generation route.
    const textInputs = { ...inputs };
    delete textInputs.images;
    const res = await fetch("/api/portal/promotion-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        inputs: textInputs,
        propertyLabel,
        propertyId,
        extraInstructions,
      }),
    });
    // Server rejected an unowned property — surface it, don't silently compose.
    if (res.status === 403) {
      return { copy: composeFallbackFlyerCopy(inputs, propertyLabel), source: "forbidden" };
    }
    if (!res.ok) return { copy: composeFallbackFlyerCopy(inputs, propertyLabel), source: "fallback" };
    const body = (await res.json()) as { copy?: FlyerCopy };
    if (!body.copy || !body.copy.headline) {
      return { copy: composeFallbackFlyerCopy(inputs, propertyLabel), source: "fallback" };
    }
    return { copy: body.copy, source: "ai" };
  } catch {
    return { copy: composeFallbackFlyerCopy(inputs, propertyLabel), source: "fallback" };
  }
}

/**
 * Generate channel-specific promotion text (social, email, SMS).
 */
export async function generatePromotionTextCopy(
  inputs: PromotionInputs,
  propertyLabel: string,
  format: PromotionTextFormat,
  opts?: { propertyId?: string | null; extraInstructions?: string },
): Promise<{ copy: PromotionTextCopy; source: "ai" | "fallback" | "forbidden" }> {
  if (isDemoModeActive() || typeof window === "undefined") {
    return { copy: composeFallbackPromotionText(inputs, propertyLabel, format), source: "fallback" };
  }
  try {
    const textInputs = { ...inputs };
    delete textInputs.images;
    const res = await fetch("/api/portal/promotion-text-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        inputs: textInputs,
        propertyLabel,
        propertyId: opts?.propertyId ?? null,
        format,
        extraInstructions: opts?.extraInstructions ?? "",
      }),
    });
    if (res.status === 403) {
      return { copy: composeFallbackPromotionText(inputs, propertyLabel, format), source: "forbidden" };
    }
    if (!res.ok) {
      return { copy: composeFallbackPromotionText(inputs, propertyLabel, format), source: "fallback" };
    }
    const body = (await res.json()) as { copy?: PromotionTextCopy };
    if (!body.copy?.body?.trim()) {
      return { copy: composeFallbackPromotionText(inputs, propertyLabel, format), source: "fallback" };
    }
    return { copy: { ...body.copy, format }, source: "ai" };
  } catch {
    return { copy: composeFallbackPromotionText(inputs, propertyLabel, format), source: "fallback" };
  }
}
