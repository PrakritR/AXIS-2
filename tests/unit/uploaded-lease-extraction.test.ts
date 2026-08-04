/**
 * The three promises `uploaded-lease-extraction.ts` makes about a legal
 * document, each with a test that goes red if it is broken:
 *
 *   nothing invented  — a term the document does not state exactly once is blank
 *   nothing authored  — output text is the source's own bytes
 *   nothing lost      — sections partition the source exactly
 */
import { describe, expect, it } from "vitest";
import {
  assertSectionsPartition,
  buildUploadedLeaseParse,
  confirmedUploadedLeaseReview,
  extractLeaseFields,
  joinLeasePages,
  normalizeLeaseDate,
  normalizeLeaseMoney,
  normalizeUploadedLeaseParse,
  pageForOffset,
  splitLeasePagesIntoSections,
  uploadedLeaseNeedsManagerConfirmation,
  UPLOADED_LEASE_PARSE_VERSION,
  type UploadedLeaseFieldKey,
} from "@/lib/uploaded-lease-extraction";

const PAGE_1 = `RESIDENTIAL LEASE AGREEMENT

This Agreement is made between Harbour Point Holdings LLC ("Landlord") and Dana Whitfield ("Tenant").

1. PREMISES
The premises located at 44 Alder Way, Unit 3, Fremont, CA 94536.

2. TERM
The term shall commence on March 1, 2026 and shall end on February 28, 2027.`;

const PAGE_2 = `3. RENT
Monthly rent is $2,150.00, due on the 1st day of each calendar month.
A late fee of $75.00 applies after the grace period.

4. SECURITY DEPOSIT
Tenant shall pay a security deposit of $3,000.00 prior to occupancy.

5. QUIET ENJOYMENT
Tenant shall not disturb the peaceful enjoyment of other occupants.`;

function fieldOf(fields: ReturnType<typeof extractLeaseFields>, key: UploadedLeaseFieldKey) {
  const found = fields.find((f) => f.key === key);
  if (!found) throw new Error(`no field ${key}`);
  return found;
}

describe("uploaded lease text is never lost", () => {
  it("partitions the source exactly across sections", () => {
    const doc = joinLeasePages([PAGE_1, PAGE_2]);
    const sections = splitLeasePagesIntoSections(doc);
    expect(sections.length).toBeGreaterThan(1);
    expect(() => assertSectionsPartition(doc, sections)).not.toThrow();
    // Spans tile the whole document end to end.
    expect(sections[0]!.charStart).toBe(0);
    expect(sections[sections.length - 1]!.charEnd).toBe(doc.text.length);
  });

  it("keeps text that matches no heading rather than dropping it", () => {
    const doc = joinLeasePages(["loose preamble with no heading at all\nsecond line"]);
    const sections = splitLeasePagesIntoSections(doc);
    expect(() => assertSectionsPartition(doc, sections)).not.toThrow();
    expect(sections.map((s) => s.title + s.body).join("")).toContain("loose preamble");
  });

  it("keeps a heading that has no body under it", () => {
    const doc = joinLeasePages(["1. TERMINATION\n\n2. NOTICES\nWritten notice is required."]);
    const sections = splitLeasePagesIntoSections(doc);
    expect(() => assertSectionsPartition(doc, sections)).not.toThrow();
    expect(sections.some((s) => s.title.includes("TERMINATION"))).toBe(true);
  });

  it("reports the page a section starts on", () => {
    const doc = joinLeasePages([PAGE_1, PAGE_2]);
    const rentSection = splitLeasePagesIntoSections(doc).find((s) => s.title.includes("RENT"));
    expect(rentSection?.page).toBe(2);
    expect(pageForOffset(doc, 0)).toBe(1);
    expect(pageForOffset(doc, doc.text.length - 1)).toBe(2);
  });
});

describe("uploaded lease terms are never invented", () => {
  const doc = joinLeasePages([PAGE_1, PAGE_2]);
  const fields = extractLeaseFields(doc);

  it("extracts a term the document states once, with its page and snippet", () => {
    const rent = fieldOf(fields, "monthlyRent");
    expect(rent.status).toBe("extracted");
    expect(rent.normalized).toBe("2150.00");
    expect(rent.source?.page).toBe(2);
    expect(rent.source?.snippet).toContain("Monthly rent");
  });

  it("leaves a term the document states two different ways BLANK", () => {
    const conflicted = joinLeasePages([
      "Monthly rent is $2,150.00 for the first year.",
      "Monthly rent is $2,400.00 thereafter.",
    ]);
    const rent = fieldOf(extractLeaseFields(conflicted), "monthlyRent");
    expect(rent.status).toBe("ambiguous");
    expect(rent.value).toBe("");
    expect(rent.candidates.map((c) => c.value).sort()).toEqual(["$2,150.00", "$2,400.00"]);
    // Both readings keep their page so the manager can go and look.
    expect(new Set(rent.candidates.map((c) => c.source.page))).toEqual(new Set([1, 2]));
  });

  it("leaves a term the document never states BLANK rather than defaulting it", () => {
    const silent = joinLeasePages(["1. PREMISES\nThe premises are described in Exhibit A."]);
    const deposit = fieldOf(extractLeaseFields(silent), "securityDeposit");
    expect(deposit.status).toBe("not_found");
    expect(deposit.value).toBe("");
    expect(deposit.normalized).toBeNull();
  });

  it("refuses to normalize a date whose format means two different days", () => {
    // Unambiguous forms normalize.
    expect(normalizeLeaseDate("March 1, 2026")).toBe("2026-03-01");
    expect(normalizeLeaseDate("2026-03-01")).toBe("2026-03-01");
    expect(normalizeLeaseDate("1st day of March, 2026")).toBe("2026-03-01");
    // A bare numeric date does not: 03/04/2026 is two different days by convention.
    expect(normalizeLeaseDate("03/04/2026")).toBeNull();
  });

  it("keeps the document's own wording as the value even when it cannot normalize it", () => {
    const numeric = joinLeasePages(["The term shall commence on 03/04/2026."]);
    const start = fieldOf(extractLeaseFields(numeric), "leaseStart");
    expect(start.status).toBe("extracted");
    expect(start.value).toBe("03/04/2026");
    expect(start.normalized).toBeNull();
  });

  it("does not read a party name out of boilerplate", () => {
    expect(normalizeLeaseMoney("$1,234.56")).toBe("1234.56");
    expect(normalizeLeaseMoney("as agreed")).toBeNull();
    const tenant = fieldOf(fields, "tenantName");
    expect(tenant.status).toBe("extracted");
    expect(tenant.value).toBe("Dana Whitfield");
  });
});

describe("parse assembly and review state", () => {
  it("marks a fresh parse as needing review", () => {
    const parse = buildUploadedLeaseParse({
      pages: [PAGE_1, PAGE_2],
      fileName: "harbour-point.pdf",
      sourceSha256: "a".repeat(64),
      extractedAtIso: "2026-08-01T00:00:00.000Z",
    });
    expect(parse.status).toBe("parsed");
    expect(parse.pageCount).toBe(2);
    expect(parse.review.status).toBe("needs_review");
    expect(uploadedLeaseNeedsManagerConfirmation(parse)).toBe(true);
  });

  it("fails loudly on an unreadable document instead of returning empty sections", () => {
    const parse = buildUploadedLeaseParse({
      pages: ["", "   "],
      fileName: "scan.pdf",
      sourceSha256: null,
      extractedAtIso: "2026-08-01T00:00:00.000Z",
    });
    expect(parse.status).toBe("failed");
    expect(parse.failureReason).toMatch(/no text/i);
    // A failed parse still holds the lease.
    expect(uploadedLeaseNeedsManagerConfirmation(parse)).toBe(true);
  });

  it("refuses to shorten an oversized document", () => {
    const parse = buildUploadedLeaseParse({
      pages: ["A".repeat(300_001)],
      fileName: "huge.pdf",
      sourceSha256: null,
      extractedAtIso: "2026-08-01T00:00:00.000Z",
    });
    expect(parse.status).toBe("failed");
    expect(parse.failureReason).toMatch(/not shortened/i);
  });

  it("drops unknown override keys when rehydrating from storage", () => {
    const rehydrated = normalizeUploadedLeaseParse({
      version: UPLOADED_LEASE_PARSE_VERSION,
      status: "parsed",
      sourceFileName: "x.pdf",
      sections: [],
      fields: [{ key: "monthlyRent" }, { key: "notAField" }],
      review: { status: "confirmed", overrides: { monthlyRent: "$1,000.00", notAField: "hack" } },
    });
    // The unknown key is dropped, and every canonical term is still listed: a
    // missing row would read as "does not apply", a blank one as "go check".
    expect(rehydrated?.fields.map((f) => f.key)).toEqual([
      "landlordName",
      "tenantName",
      "propertyAddress",
      "leaseStart",
      "leaseEnd",
      "monthlyRent",
      "securityDeposit",
      "rentDueDay",
      "lateFee",
    ]);
    expect(rehydrated?.fields.filter((f) => f.status !== "not_found")).toEqual([]);
    expect(rehydrated?.fields.every((f) => f.value === "")).toBe(true);
    expect(rehydrated?.review.overrides).toEqual({ monthlyRent: "$1,000.00" });
    // No sourceSha256 to bind to, so the who-and-when confirmation still counts.
    expect(uploadedLeaseNeedsManagerConfirmation(rehydrated)).toBe(false);
  });

  it("only honours a confirmation bound to the document it was made against", () => {
    const digest = "a".repeat(64);
    const parse = buildUploadedLeaseParse({
      pages: ["1. RENT\nMonthly rent is $2,150.00."],
      fileName: "x.pdf",
      sourceSha256: digest,
      extractedAtIso: "2026-08-01T00:00:00.000Z",
    });

    const bound = { ...parse, review: confirmedUploadedLeaseReview(parse.review, { atIso: "2026-08-01T00:00:00.000Z", documentSha256: digest }) };
    expect(uploadedLeaseNeedsManagerConfirmation(bound)).toBe(false);

    // The same attestation must not carry over to different bytes.
    expect(uploadedLeaseNeedsManagerConfirmation({ ...bound, sourceSha256: "b".repeat(64) })).toBe(true);
    // A confirmation that names no document at all is not a confirmation.
    expect(
      uploadedLeaseNeedsManagerConfirmation({ ...parse, review: { status: "confirmed", confirmedByName: "Forged" } }),
    ).toBe(true);
  });

  it("treats a row with no parse as unaffected", () => {
    expect(uploadedLeaseNeedsManagerConfirmation(null)).toBe(false);
    expect(uploadedLeaseNeedsManagerConfirmation(undefined)).toBe(false);
  });
});
