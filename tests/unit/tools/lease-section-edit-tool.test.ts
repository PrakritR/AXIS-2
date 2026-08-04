import { describe, expect, it } from "vitest";
import { proposeLeaseSectionEditTool } from "@/lib/tools/domains/leases";
import { makeManagerRowsCtx, managerRow, previewWrite } from "./fake-agent-ctx";

const lease = {
  id: "lease_section_tool",
  residentName: "Jordan Lee",
  residentEmail: "jordan@example.com",
  unit: "Unit 2",
  bucket: "manager",
  status: "Manager Review",
  thread: [],
  generatedHtml: `<html><body>
    <h2>Rent</h2><p>Rent is due on the first.</p>
    <h2>Lead disclosure</h2><p data-disclosure-rule="fed-lead-paint">Required legal language.</p>
  </body></html>`,
};

describe("propose_lease_section_edit", () => {
  it("rejects a disclosure section in preview", async () => {
    const ctx = makeManagerRowsCtx({
      portal_lease_pipeline_records: [managerRow("manager_a", lease, lease.id)],
    });

    const result = await previewWrite(proposeLeaseSectionEditTool, ctx, {
      leaseId: lease.id,
      sectionId: "lead-disclosure",
      format: "text",
      value: "Replace disclosure",
    });

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/cannot be edited/i) });
  });

  it("shows readable before and after text for an editable section", async () => {
    const ctx = makeManagerRowsCtx({
      portal_lease_pipeline_records: [managerRow("manager_a", lease, lease.id)],
    });

    const result = await previewWrite(proposeLeaseSectionEditTool, ctx, {
      leaseId: lease.id,
      sectionId: "rent",
      format: "text",
      value: "Rent is due on the fifth.",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preview.fields).toEqual(
        expect.arrayContaining([
          { label: "Before", value: "Rent is due on the first." },
          { label: "After", value: "Rent is due on the fifth." },
        ]),
      );
    }
  });
});
