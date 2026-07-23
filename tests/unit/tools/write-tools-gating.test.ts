import { describe, it, expect, vi } from "vitest";
import type { DemoApplicantRow } from "@/data/demo-portal";

// The messaging tool delivers through the shared portal-inbox lib; mock it so
// tests assert WHAT the tool sends without exercising Resend/Supabase.
const deliverPortalInboxMessage = vi.fn(async () => ({ ok: true as const, recipientCount: 1 }));
const appendInboxThreadReply = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/portal-inbox-delivery", () => ({
  deliverPortalInboxMessage: (...args: unknown[]) => deliverPortalInboxMessage(...(args as [])),
  appendInboxThreadReply: (...args: unknown[]) => appendInboxThreadReply(...(args as [])),
}));

// Ledger sync touches report tables the fake db doesn't model.
const syncLedgerChargeEntry = vi.fn(async () => undefined);
const reconcileDuplicateHouseholdChargeRecords = vi.fn(async () => undefined);
vi.mock("@/lib/reports/ledger-sync", () => ({
  syncLedgerChargeEntry: (...args: unknown[]) => syncLedgerChargeEntry(...(args as [])),
  reconcileDuplicateHouseholdChargeRecords: (...args: unknown[]) =>
    reconcileDuplicateHouseholdChargeRecords(...(args as [])),
}));

import { buildResidentMessagePreview } from "@/lib/tools/domains/messaging-logic";
import {
  buildBulkReminderPreview,
  buildChargeFromInput,
  type RentReminderPreview,
} from "@/lib/tools/domains/payments-logic";
import { createLeaseDraftTool, updateLeaseDraftTool } from "@/lib/tools/domains/leases";
import { buildLeaseDraft, applyLeaseDraftUpdate } from "@/lib/tools/domains/leases-logic";
import { findOwnedResident } from "@/lib/tools/domains/residents-logic";
import type { HouseholdCharge } from "@/lib/household-charges";
import { makeWritableCtx } from "./fake-agent-ctx";

function resident(overrides: Partial<DemoApplicantRow> = {}): DemoApplicantRow {
  return {
    id: "app_1",
    name: "Pat Resident",
    property: "12 Main St",
    stage: "Approved",
    bucket: "approved",
    email: "Pat@Example.com",
    detail: "",
    propertyId: "prop_1",
    managerUserId: "manager_a",
    ...overrides,
  } as DemoApplicantRow;
}

function seededCtx(residents: DemoApplicantRow[] = [resident()]) {
  return makeWritableCtx({
    manager_application_records: residents.map((r, i) => ({
      id: `rec_${i}`,
      manager_user_id: "manager_a",
      row_data: r,
    })),
  });
}

const msgInput = { residentEmail: "pat@example.com", subject: "Hello", body: "Hi Pat" };

describe("findOwnedResident", () => {
  it("matches approved residents case-insensitively and rejects everyone else", () => {
    const rows = [resident(), resident({ id: "app_2", email: "pending@x.com", bucket: "pending" as never })];
    expect(findOwnedResident(rows, "PAT@example.COM")?.id).toBe("app_1");
    expect(findOwnedResident(rows, "pending@x.com")).toBeNull(); // not approved
    expect(findOwnedResident(rows, "stranger@x.com")).toBeNull();
    expect(findOwnedResident(rows, "")).toBeNull();
  });
});

describe("buildResidentMessagePreview", () => {
  it("shows the resolved recipient, subject, and FULL untruncated body", () => {
    const body = "line one\n".repeat(100);
    const preview = buildResidentMessagePreview(resident(), { ...msgInput, body });
    expect(preview.fields.find((f) => f.label === "To")?.value).toBe("Pat Resident <pat@example.com>");
    expect(preview.fields.find((f) => f.label === "Message")?.value).toBe(body);
    expect(preview.warnings).toBeUndefined();
  });

  it("warns when the body contains a link", () => {
    const preview = buildResidentMessagePreview(resident(), { ...msgInput, body: "pay at https://evil.example" });
    expect(preview.warnings?.length).toBe(1);
  });
});

// send_resident_message was superseded by the richer `send_message` tool;
// its gated-execute behaviour (scope refusal, audit, dedupe, delivery-failure
// rollback, thread misdirection) is covered in tests/unit/tools/messaging.test.ts.

function charge(overrides: Partial<HouseholdCharge> = {}): HouseholdCharge {
  return {
    id: "hc_1",
    createdAt: "2024-01-01T00:00:00.000Z",
    residentEmail: "pat@example.com",
    residentName: "Pat Resident",
    residentUserId: null,
    propertyId: "prop_1",
    propertyLabel: "12 Main St",
    managerUserId: "manager_a",
    kind: "rent",
    title: "Monthly rent",
    amountLabel: "$1,500.00",
    balanceLabel: "$1,500.00",
    status: "pending",
    blocksLeaseUntilPaid: false,
    dueDateLabel: "Jan 1, 2020",
    ...overrides,
  };
}

describe("buildBulkReminderPreview", () => {
  it("resolves only owned overdue charges and reports the rest as missing", () => {
    const mine = [charge({ id: "ok_1" }), charge({ id: "paid", status: "paid" })];
    const { resolved, missing } = buildBulkReminderPreview(mine, ["ok_1", "paid", "foreign", "ok_1", " "]);
    expect(resolved.map((p: RentReminderPreview) => p.chargeId)).toEqual(["ok_1"]);
    expect(missing).toEqual(["paid", "foreign"]);
  });
});

describe("buildChargeFromInput", () => {
  it("builds the charge row from server data with formatted labels", () => {
    const row = buildChargeFromInput(
      resident(),
      { residentEmail: "pat@example.com", kind: "late_fee", title: "Late fee", amount: 50, dueDate: "2026-07-15" },
      "manager_a",
      "id_1",
      "2026-07-01T00:00:00.000Z",
    );
    expect(row).toMatchObject({
      id: "id_1",
      residentEmail: "pat@example.com",
      residentName: "Pat Resident",
      propertyLabel: "12 Main St",
      managerUserId: "manager_a",
      kind: "late_fee",
      amountLabel: "$50.00",
      balanceLabel: "$50.00",
      status: "pending",
      dueDateLabel: "Jul 15, 2026",
    });
  });
});

// The gated create_charge tool itself (ownership refusal, column mapping,
// ledger write-through, audit dedupe on double-confirm) is covered end to end
// against the surviving tool in tests/unit/tools/charges-automation.test.ts.


describe("lease draft tools", () => {
  it("builds a normalized Draft-stage row for an owned resident", () => {
    const row = buildLeaseDraft(resident({ assignedRoomChoice: "2B" }), { residentEmail: "pat@example.com" }, "manager_a", "lease_1", "2026-07-01T00:00:00.000Z");
    expect(row).toMatchObject({
      id: "lease_1",
      residentName: "Pat Resident",
      residentEmail: "pat@example.com",
      unit: "2B",
      bucket: "manager",
      status: "Draft",
    });
  });

  it("update only touches whitelisted fields", () => {
    const row = buildLeaseDraft(resident(), { residentEmail: "pat@example.com" }, "manager_a", "lease_1", "2026-07-01T00:00:00.000Z");
    const updated = applyLeaseDraftUpdate(row, { leaseId: "lease_1", notes: "new notes" }, "2026-07-02T00:00:00.000Z");
    expect(updated.notes).toBe("new notes");
    expect(updated.residentEmail).toBe(row.residentEmail);
    expect(updated.bucket).toBe("manager");
  });

  it("create persists an owned draft and audits it", async () => {
    const { ctx, store } = seededCtx();
    const result = await createLeaseDraftTool.handler(ctx, { residentEmail: "pat@example.com" });
    expect(result.reply).toContain("lease draft");
    expect(store.portal_lease_pipeline_records).toHaveLength(1);
    expect(store.portal_lease_pipeline_records![0]).toMatchObject({
      manager_user_id: "manager_a",
      resident_email: "pat@example.com",
      status: "manager",
    });
    expect(store.audit_log).toHaveLength(1);
  });

  it("update refuses a lease owned by another landlord", async () => {
    const { ctx, store } = seededCtx();
    store.portal_lease_pipeline_records = [
      {
        id: "lease_foreign",
        manager_user_id: "manager_b",
        row_data: { id: "lease_foreign", residentName: "X", bucket: "manager" },
      },
    ];
    await expect(
      updateLeaseDraftTool.handler(ctx, { leaseId: "lease_foreign", notes: "hijack" }),
    ).rejects.toThrow(/No lease/);
  });

  it("update refuses once the lease has a signature", async () => {
    const { ctx, store } = seededCtx();
    store.portal_lease_pipeline_records = [
      {
        id: "lease_signed",
        manager_user_id: "manager_a",
        row_data: {
          id: "lease_signed",
          residentName: "Pat Resident",
          bucket: "manager",
          managerSignature: { name: "Boss", signedAtIso: "2026-06-01T00:00:00.000Z", role: "manager" },
        },
      },
    ];
    await expect(
      updateLeaseDraftTool.handler(ctx, { leaseId: "lease_signed", notes: "too late" }),
    ).rejects.toThrow(/no longer be edited/);
  });
});
