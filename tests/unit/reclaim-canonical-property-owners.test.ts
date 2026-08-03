/**
 * The seed's coherence checks all scope `.in("manager_user_id", testManagerIds)`,
 * so a canonical property parked on a STRANGER's account is absent from every
 * one of them — and the account prune then deletes property rows by stray owner,
 * turning the drift into data loss. `reclaimCanonicalPropertyOwners` is the step
 * that has to see it, and it must verify by re-reading rather than trusting the
 * UPDATE's status.
 */
import { describe, expect, it } from "vitest";
import {
  // @ts-expect-error — plain-node seed helper, no types
  CANONICAL_DEMO_MANAGER_EMAIL,
  // @ts-expect-error — plain-node seed helper, no types
  reclaimCanonicalPropertyOwners,
  // @ts-expect-error — plain-node seed helper, no types
  resolveCanonicalReclaimManagerEmail,
} from "../helpers/reclaim-canonical-property-owners.mjs";

type Row = { id: string; manager_user_id: string; property_data?: unknown; row_data?: unknown };

/** Minimal PostgREST stand-in over an in-memory table. */
function makeSupabase(rows: Row[], opts: { updatesLandInStore?: boolean } = {}) {
  const store = rows.map((r) => ({ ...r }));
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const client = {
    from() {
      let pendingPatch: Record<string, unknown> | null = null;
      const builder = {
        select() {
          return builder;
        },
        in(_col: string, ids: string[]) {
          return Promise.resolve({ data: store.filter((r) => ids.includes(r.id)), error: null });
        },
        update(patch: Record<string, unknown>) {
          pendingPatch = patch;
          return builder;
        },
        eq(_col: string, id: string) {
          updates.push({ id, patch: pendingPatch ?? {} });
          if (opts.updatesLandInStore !== false) {
            const hit = store.find((r) => r.id === id);
            if (hit) Object.assign(hit, pendingPatch);
          }
          return Promise.resolve({ error: null });
        },
      };
      return builder;
    },
  };
  return { client, store, updates };
}

const OWNER = "mgr-real-owner";
const STRAY = "mgr-legacy-account";
const logs: string[] = [];
const log = (m: string) => logs.push(m);

describe("reclaimCanonicalPropertyOwners", () => {
  it("moves a drifted canonical property back to its intended owner", async () => {
    const db = makeSupabase([
      { id: "mgr-demo-cascade", manager_user_id: STRAY, property_data: { managerUserId: STRAY }, row_data: null },
      { id: "mgr-demo-ballard", manager_user_id: OWNER, property_data: { managerUserId: OWNER } },
    ]);

    const result = await reclaimCanonicalPropertyOwners(
      db.client,
      { "mgr-demo-cascade": OWNER, "mgr-demo-ballard": OWNER },
      { log },
    );

    expect(result.reclaimed).toEqual([{ id: "mgr-demo-cascade", from: STRAY, to: OWNER }]);
    expect(db.store.find((r) => r.id === "mgr-demo-cascade")?.manager_user_id).toBe(OWNER);
  });

  it("mirrors the owner into property_data — the blob the browser posts back", async () => {
    const db = makeSupabase([
      {
        id: "mgr-demo-cascade",
        manager_user_id: STRAY,
        property_data: { title: "Cascade Lofts", managerUserId: STRAY },
        row_data: { name: "Cascade Lofts" },
      },
    ]);

    await reclaimCanonicalPropertyOwners(db.client, { "mgr-demo-cascade": OWNER }, { log });

    const patch = db.updates[0].patch as { property_data: Record<string, unknown>; row_data: Record<string, unknown> };
    expect(patch.property_data).toEqual({ title: "Cascade Lofts", managerUserId: OWNER });
    expect(patch.row_data).toEqual({ name: "Cascade Lofts", managerUserId: OWNER });
  });

  it("leaves correctly owned rows completely untouched", async () => {
    const db = makeSupabase([{ id: "mgr-demo-cascade", manager_user_id: OWNER }]);
    const result = await reclaimCanonicalPropertyOwners(db.client, { "mgr-demo-cascade": OWNER }, { log });
    expect(result.reclaimed).toEqual([]);
    expect(db.updates).toEqual([]);
  });

  it("reports an absent canonical property instead of inventing one", async () => {
    const db = makeSupabase([]);
    const result = await reclaimCanonicalPropertyOwners(db.client, { "mgr-demo-cascade": OWNER }, { log });
    expect(result.missing).toEqual(["mgr-demo-cascade"]);
    expect(db.updates).toEqual([]);
  });

  it("leaves a row with a blank expected owner alone instead of aborting the seed", async () => {
    const db = makeSupabase([{ id: "mgr-demo-cascade", manager_user_id: STRAY }]);

    const result = await reclaimCanonicalPropertyOwners(db.client, { "mgr-demo-cascade": "" }, { log });

    expect(result.reclaimed).toEqual([]);
    expect(db.updates).toEqual([]);
    expect(db.store[0].manager_user_id).toBe(STRAY);
  });

  it("throws when a row is STILL mis-owned after the write, rather than reporting success", async () => {
    // The UPDATE reports `error: null` but the row does not move — exactly the
    // "the write said ok" evidence that let this drift survive a seed run.
    const db = makeSupabase([{ id: "mgr-demo-cascade", manager_user_id: STRAY }], {
      updatesLandInStore: false,
    });

    await expect(
      reclaimCanonicalPropertyOwners(db.client, { "mgr-demo-cascade": OWNER }, { log }),
    ).rejects.toThrow(/still mis-owned/);
  });
});

/**
 * The standalone repair must never follow a stale `E2E_MANAGER_EMAIL`: doing so
 * moves all five canonical properties onto that account, i.e. it performs the
 * drift it exists to undo. The env var stays legitimate for the full seed (CI
 * overrides it and passes its own owner map in), so the guard lives here only.
 */
describe("resolveCanonicalReclaimManagerEmail", () => {
  const LEGACY = "manager@test.axis.local";

  it("falls back to the canonical demo manager when E2E_MANAGER_EMAIL is unset", () => {
    expect(resolveCanonicalReclaimManagerEmail({})).toBe(CANONICAL_DEMO_MANAGER_EMAIL);
  });

  it("falls back to the canonical demo manager when E2E_MANAGER_EMAIL is empty", () => {
    expect(resolveCanonicalReclaimManagerEmail({ E2E_MANAGER_EMAIL: "   " })).toBe(CANONICAL_DEMO_MANAGER_EMAIL);
  });

  it("accepts an E2E_MANAGER_EMAIL that already names the canonical manager", () => {
    expect(
      resolveCanonicalReclaimManagerEmail({ E2E_MANAGER_EMAIL: `  ${CANONICAL_DEMO_MANAGER_EMAIL.toUpperCase()} ` }),
    ).toBe(CANONICAL_DEMO_MANAGER_EMAIL);
  });

  it("throws naming BOTH accounts when E2E_MANAGER_EMAIL names a different manager", () => {
    // Naming only one address is what makes such an error unactionable — the
    // reader has to know what it IS and what it SHOULD BE without opening source.
    expect(() => resolveCanonicalReclaimManagerEmail({ E2E_MANAGER_EMAIL: LEGACY })).toThrow(LEGACY);
    expect(() => resolveCanonicalReclaimManagerEmail({ E2E_MANAGER_EMAIL: LEGACY })).toThrow(
      CANONICAL_DEMO_MANAGER_EMAIL,
    );
  });
});
