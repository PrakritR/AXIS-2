import { describe, expect, it, vi } from "vitest";
import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  attachResidentSetupToken,
  findApplicationForResidentSetup,
  relinkResidentSetupApplicationEmail,
} from "@/lib/auth/resident-setup-token";

function baseRow(overrides: Partial<DemoApplicantRow> = {}): DemoApplicantRow {
  return {
    id: "PROPLANE-ABC12345",
    name: "Alex Chen",
    property: "Sunset House",
    stage: "Submitted",
    bucket: "pending",
    detail: "Submitted",
    email: "alex@example.com",
    propertyId: "prop-1",
    application: { phone: "(206) 555-0142", fullLegalName: "Alex Chen" } as never,
    ...overrides,
  };
}

/** Minimal chainable stub for `db.from("...").select().in().limit()`. */
function makeLookupDb(records: Array<{ id: string; resident_email: string; row_data: unknown; manager_user_id?: string }>) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: records, error: null }),
        }),
      }),
    }),
  };
}

describe("findApplicationForResidentSetup — phone", () => {
  it("returns the application phone alongside the identity for setup prefill", async () => {
    const { row, token } = attachResidentSetupToken(baseRow());
    const db = makeLookupDb([
      { id: row.id, resident_email: row.email!, row_data: row, manager_user_id: "mgr-1" },
    ]);

    const lookup = await findApplicationForResidentSetup(db as never, { token, axisId: row.id });
    expect(lookup.ok).toBe(true);
    if (!lookup.ok) return;
    expect(lookup.phone).toBe("(206) 555-0142");
    expect(lookup.email).toBe("alex@example.com");
  });

  it("returns null phone when the application carries none", async () => {
    const { row, token } = attachResidentSetupToken(baseRow({ application: { fullLegalName: "Alex Chen" } as never }));
    const db = makeLookupDb([{ id: row.id, resident_email: row.email!, row_data: row }]);
    const lookup = await findApplicationForResidentSetup(db as never, { token, axisId: row.id });
    expect(lookup.ok).toBe(true);
    if (!lookup.ok) return;
    expect(lookup.phone).toBeNull();
  });
});

describe("relinkResidentSetupApplicationEmail", () => {
  it("rewrites resident_email and the snapshot email onto the new account", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const db = { from: vi.fn().mockReturnValue({ upsert }) };
    const { row } = attachResidentSetupToken(baseRow({ managerUserId: "mgr-1" }));

    const relinked = await relinkResidentSetupApplicationEmail(db as never, row, "New.Google@Example.com");

    expect(relinked.email).toBe("new.google@example.com");
    // The persisted row uses the new email in BOTH the column and the snapshot, so
    // downstream email-keyed provisioning finds it.
    const [payload, opts] = upsert.mock.calls[0]!;
    expect(payload.resident_email).toBe("new.google@example.com");
    expect((payload.row_data as DemoApplicantRow).email).toBe("new.google@example.com");
    expect(payload.id).toBe(row.id);
    expect(opts).toEqual({ onConflict: "id" });
  });
});
