import { describe, expect, it, vi } from "vitest";
import {
  findPropertyIdsNotOwnedByManager,
  resolveInviterOwnedProperties,
} from "@/lib/auth/co-manager-invite-scope";

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

/**
 * The write-side gate above only protects rows created after it shipped, so the
 * scope resolvers re-check ownership when they turn an accepted link into
 * access. That has to stay ONE batched lookup — it runs on every co-manager
 * request.
 */
function ownershipDb(rows: { id: string; manager_user_id: string }[] | null, error: { message: string } | null = null) {
  const inFn = vi.fn().mockResolvedValue({ data: rows, error });
  const select = vi.fn(() => ({ in: inFn }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as never, from, select, in: inFn };
}

describe("resolveInviterOwnedProperties", () => {
  it("allows only the pairs where the inviter is the property's current manager", async () => {
    const db = ownershipDb([
      { id: "prop-a", manager_user_id: "mgr-1" },
      { id: "prop-b", manager_user_id: "mgr-victim" },
    ]);
    const owns = await resolveInviterOwnedProperties(db.client, [
      { inviterUserId: "mgr-1", propertyIds: ["prop-a", "prop-b"] },
    ]);
    expect(owns("mgr-1", "prop-a")).toBe(true);
    expect(owns("mgr-1", "prop-b")).toBe(false);
  });

  it("resolves every link in a single query", async () => {
    const db = ownershipDb([{ id: "prop-a", manager_user_id: "mgr-1" }]);
    await resolveInviterOwnedProperties(db.client, [
      { inviterUserId: "mgr-1", propertyIds: ["prop-a", "prop-b"] },
      { inviterUserId: "mgr-2", propertyIds: ["prop-b", "prop-c"] },
    ]);
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.in).toHaveBeenCalledWith("id", ["prop-a", "prop-b", "prop-c"]);
  });

  it("treats a property that no longer exists as not owned", async () => {
    const db = ownershipDb([]);
    const owns = await resolveInviterOwnedProperties(db.client, [
      { inviterUserId: "mgr-1", propertyIds: ["ghost"] },
    ]);
    expect(owns("mgr-1", "ghost")).toBe(false);
  });

  it("fails closed when ownership cannot be established", async () => {
    const db = ownershipDb(null, { message: "connection reset" });
    const owns = await resolveInviterOwnedProperties(db.client, [
      { inviterUserId: "mgr-1", propertyIds: ["prop-a"] },
    ]);
    expect(owns("mgr-1", "prop-a")).toBe(false);
  });

  it("never treats a blank inviter id as an owner", async () => {
    const db = ownershipDb([{ id: "prop-a", manager_user_id: "" }]);
    const owns = await resolveInviterOwnedProperties(db.client, [{ inviterUserId: "", propertyIds: ["prop-a"] }]);
    expect(owns("", "prop-a")).toBe(false);
  });

  it("skips the query entirely when nothing is assigned", async () => {
    const db = ownershipDb([]);
    const owns = await resolveInviterOwnedProperties(db.client, [{ inviterUserId: "mgr-1", propertyIds: [] }]);
    expect(db.from).not.toHaveBeenCalled();
    expect(owns("mgr-1", "prop-a")).toBe(false);
  });
});
