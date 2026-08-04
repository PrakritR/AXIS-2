// The tenant-name half of the parties guard has to work for residents whose
// names are not written in the Latin alphabet. An ASCII-only token filter left
// both sides empty, and the comparison fails open on an empty set — so for
// those residents a document naming an entirely different person passed
// unflagged, which is precisely the case this guard exists to catch.
//
// The fingerprint is the other half: it must move only when the COMPARISON
// could move, or a reformatted date re-gates a send and tells the manager the
// record changed when nothing about it did.
import { describe, expect, it } from "vitest";
import { leaseDocumentMismatches, leaseRecordFingerprint } from "@/lib/lease-document-mismatch";
import {
  UPLOADED_LEASE_PARSE_VERSION,
  type UploadedLeaseParse,
} from "@/lib/uploaded-lease-extraction";

function parseNaming(tenantName: string): UploadedLeaseParse {
  return {
    version: UPLOADED_LEASE_PARSE_VERSION,
    status: "parsed",
    sourceFileName: "lease.pdf",
    sourceSha256: "a".repeat(64),
    pageCount: 1,
    characterCount: 100,
    extractedAtIso: "2026-08-01T00:00:00.000Z",
    sections: [],
    fields: [
      {
        key: "tenantName",
        label: "Tenant / Resident",
        status: "extracted",
        value: tenantName,
        normalized: null,
        source: { page: 1, charStart: 0, charEnd: 10, snippet: tenantName },
        candidates: [],
        mapsTo: "residentName",
      },
    ],
    review: { status: "needs_review" },
  };
}

function tenantMismatch(documentName: string, recordName: string) {
  return leaseDocumentMismatches(parseNaming(documentName), { residentName: recordName });
}

describe("names are compared in every script, not only the Latin alphabet", () => {
  it("treats an accented name and its unaccented spelling as the same party", () => {
    expect(tenantMismatch("José Álvarez", "Jose Alvarez")).toEqual([]);
  });

  it("treats a non-Latin name matching the record as the same party", () => {
    expect(tenantMismatch("张伟", "张伟")).toEqual([]);
    expect(tenantMismatch("Дмитрий Соколов", "Дмитрий Соколов")).toEqual([]);
  });

  it("flags a non-Latin document name that names an entirely different person", () => {
    const cjk = tenantMismatch("李娜", "张伟");
    expect(cjk.map((m) => m.key)).toEqual(["tenantName"]);
    expect(cjk[0]?.documentValue).toBe("李娜");
    expect(cjk[0]?.recordValue).toBe("张伟");

    expect(tenantMismatch("Ольга Петрова", "Дмитрий Соколов").map((m) => m.key)).toEqual([
      "tenantName",
    ]);
  });

  it("still shares a surname without complaint", () => {
    expect(tenantMismatch("Дмитрий А. Соколов и Ольга Петрова", "Дмитрий Соколов")).toEqual([]);
  });

  it("keeps failing open when either side has no comparable word at all", () => {
    expect(tenantMismatch("—", "Diego Morales")).toEqual([]);
    expect(tenantMismatch("Diego Morales", "1234")).toEqual([]);
  });
});

describe("the record fingerprint moves only when the comparison could", () => {
  const record = {
    residentName: "Diego Morales",
    leaseStart: "2026-03-01",
    leaseEnd: "2027-02-28",
    rentLabel: "$1,050.00 / month",
  };

  it("is unchanged by a reformat that cannot change the answer", () => {
    expect(
      leaseRecordFingerprint({
        ...record,
        leaseStart: "March 1, 2026",
        leaseEnd: "February 28, 2027",
        rentLabel: "1050 per month",
      }),
    ).toBe(leaseRecordFingerprint(record));
  });

  it("is unchanged by a name reordering or an accent, which the comparison also ignores", () => {
    expect(leaseRecordFingerprint({ ...record, residentName: "Morales, Diego" })).toBe(
      leaseRecordFingerprint(record),
    );
    expect(leaseRecordFingerprint({ ...record, residentName: "Díego Morales" })).toBe(
      leaseRecordFingerprint(record),
    );
  });

  it("moves when a term the comparison reads actually changes", () => {
    expect(leaseRecordFingerprint({ ...record, rentLabel: "$1,450.00 / month" })).not.toBe(
      leaseRecordFingerprint(record),
    );
    expect(leaseRecordFingerprint({ ...record, leaseStart: "2026-04-01" })).not.toBe(
      leaseRecordFingerprint(record),
    );
    expect(leaseRecordFingerprint({ ...record, residentName: "Shivansh Nikhra" })).not.toBe(
      leaseRecordFingerprint(record),
    );
  });

  it("stays specific when a term cannot be normalized, rather than collapsing to blank", () => {
    const unparseable = { ...record, leaseStart: "01/02/2026", rentLabel: "market rate" };
    expect(leaseRecordFingerprint(unparseable)).toContain("01/02/2026");
    expect(leaseRecordFingerprint(unparseable)).toContain("market rate");
    expect(leaseRecordFingerprint({ ...unparseable, leaseStart: "02/01/2026" })).not.toBe(
      leaseRecordFingerprint(unparseable),
    );
  });
});
