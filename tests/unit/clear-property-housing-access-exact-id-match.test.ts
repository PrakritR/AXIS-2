/**
 * `clearHousingAccessForDeletedProperty` runs with the SERVICE-ROLE client and
 * rewrites `account_link_invites`, `manager_application_records` and
 * `portal_pro_relationship_records` across EVERY manager. It used to match ids
 * through a normalizing token (`id.replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80)`),
 * which made one manager's id fold onto another's.
 *
 * That turned "delete my own listing" into a cross-manager primitive:
 * `mgr-victim-house-1.` is a DISTINCT primary key, so any signed-in account
 * could create a record under it, become its owner, and delete it — a fully
 * authorized delete of their own row — and the cleanup would then strip the
 * victim's co-manager grants and scrub the victim's residents to "Moved out".
 *
 * The route's `isDelete && !existing` 404 guard closes a different step of the
 * same attack (deleting an id with no row at all). Both must hold; this file
 * drives the helper itself, with the row present, exactly as that attacker
 * would reach it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { clearHousingAccessForDeletedProperty } from "@/lib/auth/clear-property-housing-access";

const VICTIM_PROPERTY = "mgr-victim-house-1";
/** The attacker's own listing id. Differs by one trailing character. */
const COLLIDING_PROPERTY = "mgr-victim-house-1.";
const BYSTANDER_PROPERTY = "mgr-bystander-house-7";

type InviteRow = {
  id: string;
  assigned_property_ids: string[];
  property_co_manager_permissions: Record<string, unknown>;
};
type AppRow = {
  id: string;
  property_id: string | null;
  assigned_property_id: string | null;
  row_data: Record<string, unknown>;
};
type RelRow = { id: string; row_data: Record<string, unknown> };

let invites: InviteRow[] = [];
let apps: AppRow[] = [];
let rels: RelRow[] = [];

function seed() {
  invites = [
    {
      id: "invite-victim-co-manager",
      assigned_property_ids: [VICTIM_PROPERTY, BYSTANDER_PROPERTY],
      property_co_manager_permissions: {
        [VICTIM_PROPERTY]: { properties: "edit" },
        [BYSTANDER_PROPERTY]: { properties: "view" },
      },
    },
  ];
  apps = [
    {
      // Legacy shape: the property id survives only inside row_data, which is
      // the fallback path that matched through the normalizing token.
      id: "app-victim-resident",
      property_id: null,
      assigned_property_id: null,
      row_data: {
        property: "12 Victim Way · 4 rooms",
        propertyId: VICTIM_PROPERTY,
        assignedRoomChoice: "Room 2",
        stage: "Approved",
      },
    },
    {
      id: "app-bystander-resident",
      property_id: null,
      assigned_property_id: null,
      row_data: { propertyId: BYSTANDER_PROPERTY, stage: "Approved" },
    },
  ];
  rels = [
    {
      id: "rel-victim-co-manager",
      row_data: {
        assignedPropertyIds: [VICTIM_PROPERTY, BYSTANDER_PROPERTY],
        propertyCoManagerPermissions: {
          [VICTIM_PROPERTY]: { properties: "edit" },
          [BYSTANDER_PROPERTY]: { properties: "view" },
        },
      },
    },
  ];
}

type Filters = { eq: Array<[string, unknown]>; is: Array<[string, unknown]> };

function query(resolve: (filters: Filters) => { data: unknown[] | null; error: null }) {
  const filters: Filters = { eq: [], is: [] };
  const chain = {
    eq(column: string, value: unknown) {
      filters.eq.push([column, value]);
      return chain;
    },
    is(column: string, value: unknown) {
      filters.is.push([column, value]);
      return chain;
    },
    limit() {
      return chain;
    },
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(resolve(filters)).then(onFulfilled, onRejected);
    },
  };
  return chain;
}

function updateBy<T extends { id: string }>(rows: T[], patch: Record<string, unknown>) {
  return {
    eq: async (_column: string, value: string) => {
      const row = rows.find((candidate) => candidate.id === value);
      if (row) Object.assign(row, patch);
      return { error: null };
    },
  };
}

/** A Supabase-shaped stub whose SELECT filters behave like the real database:
 *  `.eq` is an exact column comparison, so only the helper's own id matching is
 *  under test. */
const db = {
  from(table: string) {
    if (table === "account_link_invites") {
      return {
        select: () => query(() => ({ data: invites, error: null })),
        update: (patch: Record<string, unknown>) => updateBy(invites, patch),
      };
    }
    if (table === "manager_application_records") {
      return {
        select: () =>
          query((filters) => ({
            data: apps.filter((row) => {
              for (const [column, value] of filters.eq) {
                if ((row as unknown as Record<string, unknown>)[column] !== value) return false;
              }
              for (const [column, value] of filters.is) {
                if ((row as unknown as Record<string, unknown>)[column] !== value) return false;
              }
              return true;
            }),
            error: null,
          })),
        update: (patch: Record<string, unknown>) => updateBy(apps, patch),
      };
    }
    if (table === "portal_pro_relationship_records") {
      return {
        select: () => query(() => ({ data: rels, error: null })),
        update: (patch: Record<string, unknown>) => updateBy(rels, patch),
      };
    }
    throw new Error(`unexpected table ${table}`);
  },
} as unknown as Parameters<typeof clearHousingAccessForDeletedProperty>[0];

const victimInvite = () => invites.find((row) => row.id === "invite-victim-co-manager")!;
const victimApp = () => apps.find((row) => row.id === "app-victim-resident")!;
const victimRel = () => rels.find((row) => row.id === "rel-victim-co-manager")!;

beforeEach(seed);

describe("clearHousingAccessForDeletedProperty — a colliding id must not reach the victim", () => {
  it("leaves the victim's co-manager grant intact when the attacker deletes mgr-victim-house-1.", async () => {
    await clearHousingAccessForDeletedProperty(db, COLLIDING_PROPERTY);

    expect(victimInvite().assigned_property_ids).toEqual([VICTIM_PROPERTY, BYSTANDER_PROPERTY]);
    expect(victimInvite().property_co_manager_permissions).toEqual({
      [VICTIM_PROPERTY]: { properties: "edit" },
      [BYSTANDER_PROPERTY]: { properties: "view" },
    });
  });

  it("does not scrub the victim's resident to Moved out", async () => {
    await clearHousingAccessForDeletedProperty(db, COLLIDING_PROPERTY);

    expect(victimApp().row_data.stage).toBe("Approved");
    expect(victimApp().row_data.propertyId).toBe(VICTIM_PROPERTY);
    expect(victimApp().row_data.property).toBe("12 Victim Way · 4 rooms");
    expect(victimApp().row_data.assignedRoomChoice).toBe("Room 2");
  });

  it("does not clear the victim's pro-relationship property assignments", async () => {
    await clearHousingAccessForDeletedProperty(db, COLLIDING_PROPERTY);

    expect(victimRel().row_data.assignedPropertyIds).toEqual([VICTIM_PROPERTY, BYSTANDER_PROPERTY]);
    expect(victimRel().row_data.propertyCoManagerPermissions).toEqual({
      [VICTIM_PROPERTY]: { properties: "edit" },
      [BYSTANDER_PROPERTY]: { properties: "view" },
    });
  });

  it("reports that it changed nothing", async () => {
    const result = await clearHousingAccessForDeletedProperty(db, COLLIDING_PROPERTY);

    expect(result).toEqual({ invitesUpdated: 0, applicationsCleared: 0 });
  });
});

describe("clearHousingAccessForDeletedProperty — the exact id still cleans up", () => {
  it("strips the deleted property from the invite grant and keeps the others", async () => {
    const result = await clearHousingAccessForDeletedProperty(db, VICTIM_PROPERTY);

    expect(victimInvite().assigned_property_ids).toEqual([BYSTANDER_PROPERTY]);
    expect(victimInvite().property_co_manager_permissions).toEqual({
      [BYSTANDER_PROPERTY]: { properties: "view" },
    });
    expect(result.invitesUpdated).toBe(1);
  });

  it("scrubs the legacy row_data-only application to Moved out", async () => {
    const result = await clearHousingAccessForDeletedProperty(db, VICTIM_PROPERTY);

    expect(victimApp().property_id).toBeNull();
    expect(victimApp().assigned_property_id).toBeNull();
    expect(victimApp().row_data.stage).toBe("Moved out");
    expect(victimApp().row_data.propertyId).toBe("");
    expect(victimApp().row_data.property).toBe("");
    expect(victimApp().row_data.assignedRoomChoice).toBe("");
    expect(result.applicationsCleared).toBe(1);
  });

  it("clears the pro-relationship assignment for that property only", async () => {
    await clearHousingAccessForDeletedProperty(db, VICTIM_PROPERTY);

    expect(victimRel().row_data.assignedPropertyIds).toEqual([BYSTANDER_PROPERTY]);
    expect(victimRel().row_data.propertyCoManagerPermissions).toEqual({
      [BYSTANDER_PROPERTY]: { properties: "view" },
    });
  });

  it("leaves an unrelated resident on another property untouched", async () => {
    await clearHousingAccessForDeletedProperty(db, VICTIM_PROPERTY);

    const bystander = apps.find((row) => row.id === "app-bystander-resident")!;
    expect(bystander.row_data.stage).toBe("Approved");
    expect(bystander.row_data.propertyId).toBe(BYSTANDER_PROPERTY);
  });
});
