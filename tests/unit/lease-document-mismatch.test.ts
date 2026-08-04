// The tenant-name half of the parties guard has to work for residents whose
// names are not written in the Latin alphabet. An ASCII-only token filter left
// both sides empty, and the comparison fails open on an empty set — so for
// those residents the guard was simply inert.
//
// Widening it is only half the job: a pair this module cannot judge honestly
// must still fail OPEN rather than manufacture a mismatch, because a false
// mismatch is what teaches managers to click past the warning. A romanized
// record against a native-script document, and a script with no word
// boundaries, are both in that category.
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

describe("names are compared in every script that can be compared honestly", () => {
  it("treats an accented name and its unaccented spelling as the same party", () => {
    expect(tenantMismatch("José Álvarez", "Jose Alvarez")).toEqual([]);
    expect(tenantMismatch("Дмитрий Соколов", "Дмитрий Соколов")).toEqual([]);
  });

  it("flags a same-script non-Latin document name that names an entirely different person", () => {
    const cyrillic = tenantMismatch("Ольга Петрова", "Дмитрий Соколов");
    expect(cyrillic.map((m) => m.key)).toEqual(["tenantName"]);
    expect(cyrillic[0]?.documentValue).toBe("Ольга Петрова");
    expect(cyrillic[0]?.recordValue).toBe("Дмитрий Соколов");
  });

  it("still shares a surname without complaint", () => {
    expect(tenantMismatch("Дмитрий А. Соколов и Ольга Петрова", "Дмитрий Соколов")).toEqual([]);
  });

  /**
   * A romanization decision is not a different person, and hard-blocking that
   * whole cohort is the false-mismatch failure this module warns about.
   */
  it("never reports a cross-script pair as a disagreement", () => {
    expect(tenantMismatch("张伟", "Wei Zhang")).toEqual([]);
    expect(tenantMismatch("Wei Zhang", "张伟")).toEqual([]);
    expect(tenantMismatch("Дмитрий Соколов", "Dmitry Sokolov")).toEqual([]);
  });

  /**
   * "Share no word" needs words. With no whitespace to delimit them, any
   * differing character would read as a total disagreement, so the leniency
   * that keeps co-tenants and middle names quiet has no effect at all.
   */
  it("does not compare a script that has no word boundaries", () => {
    expect(tenantMismatch("李娜", "张伟")).toEqual([]);
    expect(tenantMismatch("김민준", "박서준")).toEqual([]);
  });

  it("keeps failing open when either side has no comparable word at all", () => {
    expect(tenantMismatch("—", "Diego Morales")).toEqual([]);
    expect(tenantMismatch("Diego Morales", "1234")).toEqual([]);
  });

  it("still objects to a Latin-script document naming someone else", () => {
    expect(tenantMismatch("Shivansh Nikhra", "Diego Morales").map((m) => m.key)).toEqual([
      "tenantName",
    ]);
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
