// @vitest-environment jsdom
/**
 * A machine-extracted contract must not be signable until a person has said it
 * is right. Delete the `leaseAwaitsUploadedLeaseReview` check in
 * `sendLeaseToResident` and the first test here goes red.
 *
 * The other half of the promise is that parsing never touches the artifact:
 * the uploaded bytes stay byte-identical through parse and confirm.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmUploadedLeaseParse,
  leaseAwaitsUploadedLeaseReview,
  readLeasePipeline,
  saveUploadedLeaseParse,
  seedDemoLeasePipeline,
  sendLeaseToResident,
  updateLeasePipelineRow,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";
import { buildUploadedLeaseParse, pendingUploadedLeaseParse } from "@/lib/uploaded-lease-extraction";
import { buildUploadedLeaseProplaneHtml } from "@/lib/uploaded-lease-proplane-format";

const MANAGER_ID = "manager-import-gate";
const ROW_ID = "lease_import_gate_1";
const ORIGINAL_PDF = "data:application/pdf;base64,JVBERi0xLjQKUFJPUExBTkVfT1JJR0lOQUw=";

function parseFixture() {
  return buildUploadedLeaseParse({
    pages: ["1. RENT\nMonthly rent is $2,150.00.", "2. TERM\nCommences on March 1, 2026."],
    fileName: "harbour-point.pdf",
    sourceSha256: "c".repeat(64),
    extractedAtIso: "2026-08-01T00:00:00.000Z",
  });
}

function uploadedRow(overrides: Partial<LeasePipelineRow> = {}): LeasePipelineRow {
  return {
    id: ROW_ID,
    residentName: "Dana Whitfield",
    residentEmail: "dana.whitfield@example.com",
    unit: "44 Alder Way · Unit 3",
    stageLabel: "Manager Review",
    updated: "Aug 1",
    bucket: "manager",
    pdfVersion: 1,
    notes: "",
    updatedAtIso: "2026-08-01T00:00:00.000Z",
    managerUserId: MANAGER_ID,
    thread: [],
    generatedHtml: null,
    managerUploadedPdf: {
      dataUrl: ORIGINAL_PDF,
      originalDataUrl: ORIGINAL_PDF,
      fileName: "harbour-point.pdf",
      uploadedAt: "2026-08-01T00:00:00.000Z",
    },
    status: "Manager Review",
    ...overrides,
  };
}

function storedRow(): LeasePipelineRow | undefined {
  return readLeasePipeline(MANAGER_ID).find((r) => r.id === ROW_ID);
}

describe("an imported lease is not signable until a manager confirms it", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/portal/leases");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
  });

  it("refuses to send a parsed-but-unconfirmed lease to the resident", async () => {
    seedDemoLeasePipeline([uploadedRow({ uploadedLeaseParse: parseFixture() })], MANAGER_ID);
    expect(leaseAwaitsUploadedLeaseReview(storedRow()!)).toBe(true);

    const result = await sendLeaseToResident(ROW_ID, MANAGER_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/confirm it before sending/i);
    expect(storedRow()?.status).toBe("Manager Review");
    expect(storedRow()?.sentToResidentAt ?? null).toBeNull();
  });

  it("holds the lease while the parse is still pending, before any text has been read", async () => {
    seedDemoLeasePipeline(
      [uploadedRow({ uploadedLeaseParse: pendingUploadedLeaseParse("harbour-point.pdf") })],
      MANAGER_ID,
    );

    const result = await sendLeaseToResident(ROW_ID, MANAGER_ID);

    expect(result.ok).toBe(false);
    expect(storedRow()?.status).toBe("Manager Review");
  });

  it("sends once a manager has confirmed", async () => {
    seedDemoLeasePipeline([uploadedRow({ uploadedLeaseParse: parseFixture() })], MANAGER_ID);

    const confirmed = confirmUploadedLeaseParse(ROW_ID, {
      managerUserId: MANAGER_ID,
      confirmedByName: "Pat Manager",
      overrides: { securityDeposit: "$3,000.00" },
      note: "Checked against the PDF.",
    });
    expect(confirmed.ok).toBe(true);
    expect(leaseAwaitsUploadedLeaseReview(storedRow()!)).toBe(false);

    const result = await sendLeaseToResident(ROW_ID, MANAGER_ID);

    expect(result.ok).toBe(true);
    expect(storedRow()?.status).toBe("Resident Signature Pending");
  });

  it("records who confirmed and which values a human supplied", () => {
    seedDemoLeasePipeline([uploadedRow({ uploadedLeaseParse: parseFixture() })], MANAGER_ID);

    confirmUploadedLeaseParse(ROW_ID, {
      managerUserId: MANAGER_ID,
      confirmedByName: "Pat Manager",
      overrides: { securityDeposit: "$3,000.00", lateFee: "   " },
    });

    const review = storedRow()?.uploadedLeaseParse?.review;
    expect(review?.status).toBe("confirmed");
    expect(review?.confirmedByName).toBe("Pat Manager");
    expect(review?.confirmedByUserId).toBe(MANAGER_ID);
    expect(review?.confirmedAtIso).toBeTruthy();
    // Blank overrides are not stored: an empty box is not a human decision.
    expect(review?.overrides).toEqual({ securityDeposit: "$3,000.00" });
  });

  it("leaves a lease with no parse behaving exactly as before", async () => {
    seedDemoLeasePipeline([uploadedRow()], MANAGER_ID);
    expect(leaseAwaitsUploadedLeaseReview(storedRow()!)).toBe(false);

    const result = await sendLeaseToResident(ROW_ID, MANAGER_ID);

    expect(result.ok).toBe(true);
    expect(storedRow()?.status).toBe("Resident Signature Pending");
  });

  it("leaves a natively generated lease behaving exactly as before", async () => {
    seedDemoLeasePipeline(
      [uploadedRow({ managerUploadedPdf: null, generatedHtml: "<html><body>NATIVE LEASE</body></html>" })],
      MANAGER_ID,
    );

    const result = await sendLeaseToResident(ROW_ID, MANAGER_ID);

    expect(result.ok).toBe(true);
    expect(storedRow()?.generatedHtml).toContain("NATIVE LEASE");
  });
});

describe("parsing never touches the uploaded artifact", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/portal/leases");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
  });

  it("keeps the original bytes byte-identical through parse and confirm", () => {
    seedDemoLeasePipeline([uploadedRow({ uploadedLeaseParse: pendingUploadedLeaseParse("harbour-point.pdf") })], MANAGER_ID);

    expect(saveUploadedLeaseParse(ROW_ID, parseFixture(), MANAGER_ID).ok).toBe(true);
    expect(storedRow()?.managerUploadedPdf?.originalDataUrl).toBe(ORIGINAL_PDF);

    confirmUploadedLeaseParse(ROW_ID, { managerUserId: MANAGER_ID, confirmedByName: "Pat Manager" });
    expect(storedRow()?.managerUploadedPdf?.originalDataUrl).toBe(ORIGINAL_PDF);
    expect(storedRow()?.managerUploadedPdf?.dataUrl).toBe(ORIGINAL_PDF);
    expect(storedRow()?.managerUploadedPdf?.fileName).toBe("harbour-point.pdf");
  });

  it("refuses a late parse that would overwrite a review a human already confirmed", () => {
    seedDemoLeasePipeline([uploadedRow({ uploadedLeaseParse: parseFixture() })], MANAGER_ID);
    confirmUploadedLeaseParse(ROW_ID, { managerUserId: MANAGER_ID, confirmedByName: "Pat Manager" });

    const late = saveUploadedLeaseParse(ROW_ID, parseFixture(), MANAGER_ID);

    expect(late.ok).toBe(false);
    expect(storedRow()?.uploadedLeaseParse?.review.status).toBe("confirmed");
  });

  it("refuses to store a parse onto a lease that already carries a signature", () => {
    seedDemoLeasePipeline(
      [
        uploadedRow({
          uploadedLeaseParse: pendingUploadedLeaseParse("harbour-point.pdf"),
          bucket: "signed",
          residentSignature: { role: "resident", name: "Dana Whitfield", signedAtIso: "2026-08-02T00:00:00.000Z" },
        }),
      ],
      MANAGER_ID,
    );

    expect(saveUploadedLeaseParse(ROW_ID, parseFixture(), MANAGER_ID).ok).toBe(false);
  });
});

/**
 * The reading is DERIVED from one upload, so it may never outlive that upload
 * nor claim more than the stored blob can support. Both failures are silent in
 * the UI — a lease held against a document that is gone, or a renderer handed a
 * field it cannot draw — so they are pinned here.
 */
describe("a stored reading cannot outlive or misrepresent its document", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/portal/leases");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
  });

  it("drops the reading when the upload it describes is replaced by generated HTML", () => {
    seedDemoLeasePipeline([uploadedRow({ uploadedLeaseParse: parseFixture() })], MANAGER_ID);
    expect(leaseAwaitsUploadedLeaseReview(storedRow()!)).toBe(true);

    // What every regenerate path writes: generated document in, upload out.
    expect(
      updateLeasePipelineRow(
        ROW_ID,
        { generatedHtml: "<html><body>REGENERATED</body></html>", managerUploadedPdf: null },
        MANAGER_ID,
      ),
    ).toBe(true);

    // Not held against a PDF the row no longer has, and no review modal with
    // nothing behind it.
    expect(storedRow()?.uploadedLeaseParse ?? null).toBeNull();
    expect(leaseAwaitsUploadedLeaseReview(storedRow()!)).toBe(false);
  });

  it("holds the lease when the stored reading cannot be interpreted", async () => {
    seedDemoLeasePipeline(
      [uploadedRow({ uploadedLeaseParse: { ...parseFixture(), version: 99 } as never })],
      MANAGER_ID,
    );

    const parse = storedRow()?.uploadedLeaseParse;
    // Fails CLOSED: kept as a parse that needs review, never dropped to null.
    expect(parse).toBeTruthy();
    expect(parse?.status).toBe("failed");
    expect(parse?.sections).toEqual([]);
    expect(leaseAwaitsUploadedLeaseReview(storedRow()!)).toBe(true);
    expect((await sendLeaseToResident(ROW_ID, MANAGER_ID)).ok).toBe(false);
  });

  it("ignores a confirmation claimed by a reading it cannot interpret", () => {
    seedDemoLeasePipeline(
      [
        uploadedRow({
          uploadedLeaseParse: {
            ...parseFixture(),
            version: 2,
            review: { status: "confirmed", confirmedByName: "Nobody" },
          } as never,
        }),
      ],
      MANAGER_ID,
    );

    expect(storedRow()?.uploadedLeaseParse?.review.status).toBe("needs_review");
    expect(leaseAwaitsUploadedLeaseReview(storedRow()!)).toBe(true);
  });

  it("survives a malformed stored reading and still renders", () => {
    seedDemoLeasePipeline(
      [
        uploadedRow({
          uploadedLeaseParse: {
            version: 1,
            status: "parsed",
            sourceFileName: "harbour-point.pdf",
            sections: [{ page: 2 }, "not a section", { title: "RENT", body: "Rent is $2,150.00." }],
            fields: [
              { key: "monthlyRent", status: "totally-made-up" },
              { key: "not-a-field", status: "extracted", value: "x" },
              { key: "securityDeposit" },
            ],
            review: { status: "needs_review" },
          } as never,
        }),
      ],
      MANAGER_ID,
    );

    const parse = storedRow()!.uploadedLeaseParse!;
    expect(parse.sections).toHaveLength(2);
    expect(parse.sections.map((s) => s.title)).toEqual(["", "RENT"]);
    expect(parse.sections.every((s) => typeof s.body === "string")).toBe(true);
    // An unknown status reads as not_found — blank and flagged, never a term.
    expect(parse.fields.map((f) => [f.key, f.status, f.value])).toEqual([
      ["monthlyRent", "not_found", ""],
      ["securityDeposit", "not_found", ""],
    ]);
    expect(parse.fields.every((f) => Array.isArray(f.candidates))).toBe(true);

    expect(() =>
      buildUploadedLeaseProplaneHtml({ parse, placement: { residentName: "Dana Whitfield" } }),
    ).not.toThrow();
  });

});
