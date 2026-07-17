import { beforeEach, describe, expect, it, vi } from "vitest";

/** Minimal chainable Supabase mock: each `.from()` call consumes one queued result. */
const queryQueue: Array<{ data: unknown[] | null }> = [];
const inCalls: Array<[string, unknown]> = [];
function chain(result: { data: unknown[] | null }) {
  const q: Record<string, unknown> = {};
  const ret = () => q;
  for (const m of ["select", "eq", "order", "limit", "not"]) q[m] = ret;
  q.in = (col: string, val: unknown) => {
    inCalls.push([col, val]);
    return q;
  };
  q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return q;
}
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: () => chain(queryQueue.shift() ?? { data: [] }),
  }),
}));

import {
  clawDefaultResidentPhoneFromEnv,
  isMappedManagerPhone,
  labelClawSmsFromManager,
  labelClawSmsFromPropLaneForManager,
  labelClawSmsFromResident,
  residentInboundAck,
  resolveMappedManagerContacts,
  resolveRegisteredClawManagers,
} from "@/lib/claw-resident-messaging.server";

function profileRow(over: Record<string, unknown> = {}) {
  return {
    id: "mgr-1",
    email: "real@landlord.com",
    full_name: "Real Landlord",
    phone: "5105551234",
    phone_verified_at: "2026-01-01T00:00:00Z",
    sms_from_number: "+12053690702",
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  queryQueue.length = 0;
  inCalls.length = 0;
  delete process.env.CLAW_MESSENGER_MANAGER_EMAILS;
  delete process.env.CLAW_MESSENGER_MANAGER_FORWARD_PHONES;
});

describe("resolveRegisteredClawManagers (DB-driven shared-line registration)", () => {
  it("includes a real manager stamped with the shared Claw line and a verified phone", async () => {
    queryQueue.push({ data: [profileRow()] });
    const managers = await resolveRegisteredClawManagers();
    expect(managers).toEqual([
      { userId: "mgr-1", email: "real@landlord.com", fullName: "Real Landlord", personalPhone: "+15105551234" },
    ]);
  });

  it("scopes the query to manager-ish roles — profiles.sms_from_number/phone_verified_at are settable by ANY authenticated user via /api/manager/phone (no role gate there), so this filter is what stops a resident/vendor self-registering onto the shared-line roster", async () => {
    queryQueue.push({ data: [profileRow()] });
    await resolveRegisteredClawManagers();
    expect(inCalls).toContainEqual(["role", ["manager", "pro", "admin", "owner"]]);
  });

  it("excludes sandbox/demo accounts even when stamped with the shared line", async () => {
    queryQueue.push({
      data: [
        profileRow({ id: "mgr-test", email: "testeverything@test.axis.local" }),
        profileRow({ id: "mgr-demo", email: "manager@test.axis.local" }),
        profileRow(),
      ],
    });
    const managers = await resolveRegisteredClawManagers();
    expect(managers.map((m) => m.email)).toEqual(["real@landlord.com"]);
  });

  it("excludes managers not stamped with the shared Claw line", async () => {
    queryQueue.push({ data: [profileRow({ sms_from_number: "+15551230000" })] });
    const managers = await resolveRegisteredClawManagers();
    expect(managers).toEqual([]);
  });

  it("never trusts an unverified phone as the manager's personal phone", async () => {
    queryQueue.push({ data: [profileRow({ phone_verified_at: null })] });
    const managers = await resolveRegisteredClawManagers();
    expect(managers[0]?.personalPhone).toBeNull();
  });
});

describe("resolveMappedManagerContacts", () => {
  it("is DB-driven by default — no env allowlist needed", async () => {
    queryQueue.push({ data: [profileRow()] });
    const contacts = await resolveMappedManagerContacts();
    expect(contacts).toEqual([
      { userId: "mgr-1", email: "real@landlord.com", fullName: "Real Landlord", personalPhone: "+15105551234" },
    ]);
  });

  it("additively includes an explicit CLAW_MESSENGER_MANAGER_EMAILS entry not yet DB-registered", async () => {
    process.env.CLAW_MESSENGER_MANAGER_EMAILS = "ops@landlord.com";
    queryQueue.push({ data: [profileRow()] });
    queryQueue.push({
      data: [
        {
          id: "mgr-2",
          email: "ops@landlord.com",
          full_name: "Ops",
          phone: "4155551234",
          phone_verified_at: "2026-01-01T00:00:00Z",
        },
      ],
    });
    const contacts = await resolveMappedManagerContacts();
    expect(contacts.map((c) => c.email).sort()).toEqual(["ops@landlord.com", "real@landlord.com"]);
  });

  it("never re-admits a sandbox email via the explicit env override", async () => {
    process.env.CLAW_MESSENGER_MANAGER_EMAILS = "testeverything@test.axis.local";
    queryQueue.push({ data: [profileRow()] });
    const contacts = await resolveMappedManagerContacts();
    expect(contacts.map((c) => c.email)).toEqual(["real@landlord.com"]);
  });
});

describe("isMappedManagerPhone", () => {
  it("recognizes a DB-registered manager's verified personal phone", async () => {
    queryQueue.push({ data: [profileRow()] });
    expect(await isMappedManagerPhone("+15105551234")).toBe(true);
  });

  it("does not recognize an unrelated phone", async () => {
    queryQueue.push({ data: [profileRow()] });
    expect(await isMappedManagerPhone("+19995551234")).toBe(false);
  });
});

describe("residentInboundAck", () => {
  it("returns natural confirmations with links when useful", () => {
    const payment = residentInboundAck("payment");
    expect(payment.toLowerCase()).toContain("payment");
    expect(payment).toMatch(/https?:\/\//);
    expect(payment).toContain("/resident/payments/pending");
    expect(payment).not.toMatch(/property manager will see this and reply here/i);

    const lease = residentInboundAck("lease");
    expect(lease.toLowerCase()).toContain("lease");
    expect(lease).toContain("/resident/lease");

    const general = residentInboundAck("general");
    expect(general.toLowerCase()).toContain("manager");
    expect(general).not.toMatch(/PropLane/i);
  });
});

describe("Claw SMS sender labels", () => {
  it("labels manager→resident relay for the resident", () => {
    expect(labelClawSmsFromManager("Hello")).toBe("(Your property manager)\nHello");
  });

  it("labels resident→manager relay for the manager", () => {
    expect(labelClawSmsFromResident("hey", "+15105794001")).toBe(
      ["Property: Unknown property", "Resident: Resident (+15105794001)", "Said: hey"].join("\n"),
    );
  });

  it("labels automated carbon-copy for the manager; resident keeps plain text", () => {
    const plain = "Rent is due Friday.";
    expect(labelClawSmsFromPropLaneForManager(plain)).toBe(
      ["Property: Unknown property", "Resident: Resident", `Sent: ${plain}`].join("\n"),
    );
    expect(
      labelClawSmsFromPropLaneForManager(plain, {
        propertyLabel: "The Pioneer",
        residentName: "Test Resident",
        residentPhone: "+15105794001",
      }),
    ).toBe(
      [
        "Property: The Pioneer",
        "Resident: Test Resident (+15105794001)",
        `Sent: ${plain}`,
      ].join("\n"),
    );
  });

  it("defaults the resident pairing phone used when no thread exists", () => {
    expect(clawDefaultResidentPhoneFromEnv()).toBe("+15105794001");
  });
});
