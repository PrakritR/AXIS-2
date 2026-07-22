import { describe, expect, it, vi } from "vitest";
import { findPropertyIdsNotOwnedByManager } from "@/lib/auth/co-manager-invite-scope";

/**
 * `assigned_property_ids` on a co-manager invite is the ownership key every
 * downstream co-manager gate reads. It used to be stored verbatim from the
 * request body, so a manager could name a victim's property id — harvested from
 * the public listing feed — and, once accepted, pass every module gate on it.
 */

function dbReturning(rows: { id: string }[] | null, error: { message: string } | null = null) {
  const inFn = vi.fn().mockResolvedValue({ data: rows, error });
  const eq = vi.fn(() => ({ in: inFn }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as never, from, select, eq, in: inFn };
}

describe("findPropertyIdsNotOwnedByManager", () => {
  it("reports ids the manager does not own", async () => {
    const db = dbReturning([{ id: "mine-1" }]);
    const res = await findPropertyIdsNotOwnedByManager(db.client, "mgr-1", ["mine-1", "victims-1"]);
    expect(res).toEqual({ ok: true, unowned: ["victims-1"] });
  });

  it("accepts a list the manager fully owns", async () => {
    const db = dbReturning([{ id: "mine-1" }, { id: "mine-2" }]);
    const res = await findPropertyIdsNotOwnedByManager(db.client, "mgr-1", ["mine-1", "mine-2"]);
    expect(res).toEqual({ ok: true, unowned: [] });
  });

  it("scopes the ownership query to the manager, never to the caller-supplied ids alone", async () => {
    const db = dbReturning([{ id: "mine-1" }]);
    await findPropertyIdsNotOwnedByManager(db.client, "mgr-1", ["mine-1"]);
    expect(db.from).toHaveBeenCalledWith("manager_property_records");
    expect(db.eq).toHaveBeenCalledWith("manager_user_id", "mgr-1");
  });

  it("treats a property that does not exist as unowned — absence is not permission", async () => {
    const db = dbReturning([]);
    const res = await findPropertyIdsNotOwnedByManager(db.client, "mgr-1", ["ghost-1"]);
    expect(res).toEqual({ ok: true, unowned: ["ghost-1"] });
  });

  it("fails closed when ownership cannot be established", async () => {
    const db = dbReturning(null, { message: "connection reset" });
    const res = await findPropertyIdsNotOwnedByManager(db.client, "mgr-1", ["mine-1"]);
    expect(res).toEqual({ ok: false, error: "connection reset" });
  });

  it("de-duplicates and ignores blank ids without querying for an empty list", async () => {
    const db = dbReturning([{ id: "mine-1" }]);
    const res = await findPropertyIdsNotOwnedByManager(db.client, "mgr-1", ["mine-1", " mine-1 ", ""]);
    expect(res).toEqual({ ok: true, unowned: [] });
    expect(db.in).toHaveBeenCalledWith("id", ["mine-1"]);
  });

  it("short-circuits an empty request without hitting the database", async () => {
    const db = dbReturning([]);
    const res = await findPropertyIdsNotOwnedByManager(db.client, "mgr-1", []);
    expect(res).toEqual({ ok: true, unowned: [] });
    expect(db.from).not.toHaveBeenCalled();
  });
});
