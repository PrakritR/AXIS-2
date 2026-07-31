/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { leaseSyncsFromResidentEdit, type LeasePipelineRow } from "@/lib/lease-pipeline-storage";

function leaseRow(over: Partial<LeasePipelineRow>): LeasePipelineRow {
  return {
    id: "lease_test_1",
    residentName: "Jane Smith",
    residentEmail: "jane@example.com",
    propertyId: "prop-1",
    bucket: "manager",
    status: "Manager Review",
    thread: [],
    versionNumber: 1,
    pdfVersion: 1,
    generatedHtml: "<p>Lease</p>",
    ...over,
  } as LeasePipelineRow;
}

describe("leaseSyncsFromResidentEdit", () => {
  it("allows sync only for Draft and Manager Review in the manager bucket", () => {
    expect(leaseSyncsFromResidentEdit(leaseRow({ status: "Draft" }))).toBe(true);
    expect(leaseSyncsFromResidentEdit(leaseRow({ status: "Manager Review" }))).toBe(true);
    expect(leaseSyncsFromResidentEdit(leaseRow({ status: "Resident Signature Pending", bucket: "resident" }))).toBe(
      false,
    );
    expect(leaseSyncsFromResidentEdit(leaseRow({ status: "Manager Signature Pending", bucket: "signed" }))).toBe(
      false,
    );
    expect(leaseSyncsFromResidentEdit(leaseRow({ status: "Fully Signed", bucket: "signed" }))).toBe(false);
  });
});
