/**
 * The rendered PropLane view must reproduce the manager's document, not a
 * summary of it, and must never dress a blank up as a value.
 */
import { describe, expect, it } from "vitest";
import {
  buildUploadedLeaseParse,
  confirmedUploadedLeaseReview,
  type UploadedLeaseParse,
} from "@/lib/uploaded-lease-extraction";
import { buildUploadedLeaseProplaneHtml } from "@/lib/uploaded-lease-proplane-format";

const PAGES = [
  `RESIDENTIAL LEASE AGREEMENT

This Agreement is made between Harbour Point Holdings LLC ("Landlord") and Dana Whitfield ("Tenant").

1. PREMISES
The premises located at 44 Alder Way, Unit 3, Fremont, CA 94536.

2. TERM
The term shall commence on March 1, 2026 and shall end on February 28, 2027.`,
  `3. RENT
Monthly rent is $2,150.00, due on the 1st day of each calendar month.

4. UNUSUAL RIDER
Tenant may keep one registered emotional support parrot in the sunroom.`,
];

function parseFixture(): UploadedLeaseParse {
  return buildUploadedLeaseParse({
    pages: PAGES,
    fileName: "harbour-point.pdf",
    sourceSha256: "b".repeat(64),
    extractedAtIso: "2026-08-01T00:00:00.000Z",
  });
}

function textOf(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ");
}

describe("uploaded lease rendered in PropLane format", () => {
  it("reproduces every non-whitespace character of the source document", () => {
    const html = buildUploadedLeaseProplaneHtml({ parse: parseFixture() });
    const rendered = textOf(html).replace(/\s+/g, "");
    for (const page of PAGES) {
      for (const line of page.split("\n").filter((l) => l.trim())) {
        expect(rendered).toContain(line.replace(/\s+/g, ""));
      }
    }
  });

  it("carries an unmapped clause through verbatim rather than summarizing it", () => {
    const html = buildUploadedLeaseProplaneHtml({ parse: parseFixture() });
    expect(textOf(html)).toContain("one registered emotional support parrot in the sunroom");
    expect(textOf(html)).toContain("UNUSUAL RIDER");
  });

  it("never authors a clause or a statute citation of its own", () => {
    const html = buildUploadedLeaseProplaneHtml({ parse: parseFixture() });
    const text = textOf(html);
    // Statute-shaped citations (RCW 59.18.xxx, Civ. Code § 1950.5) must not appear:
    // the source has none, so anything matching would have been authored here.
    expect(text).not.toMatch(/\bRCW\s+\d/);
    expect(text).not.toMatch(/§\s*\d/);
    expect(text).not.toMatch(/Civ(?:il)?\.?\s*Code/i);
  });

  it("shows a not-found term as blank and flagged, never as a guess", () => {
    const parse = parseFixture();
    const html = buildUploadedLeaseProplaneHtml({ parse });
    const deposit = parse.fields.find((f) => f.key === "securityDeposit");
    expect(deposit?.status).toBe("not_found");
    expect(deposit?.value).toBe("");
    const text = textOf(html);
    expect(text).toContain("Security deposit");
    expect(text).toContain("Needs manager review");
    expect(text).toContain("Not found in the document. Left blank rather than assumed.");
    expect(text).not.toMatch(/Security deposit\s*\$/);
  });

  it("labels the document unsignable until a human confirms it", () => {
    const parse = parseFixture();
    expect(textOf(buildUploadedLeaseProplaneHtml({ parse }))).toContain(
      "Awaiting manager review — not yet available for signature",
    );

    const confirmed: UploadedLeaseParse = {
      ...parse,
      review: confirmedUploadedLeaseReview(parse.review, {
        userId: "mgr-1",
        name: "Pat Manager",
        atIso: "2026-08-02T00:00:00.000Z",
        documentSha256: parse.sourceSha256,
      }),
    };
    const text = textOf(buildUploadedLeaseProplaneHtml({ parse: confirmed }));
    expect(text).toContain("Reviewed and confirmed by the property manager (Pat Manager)");
    expect(text).not.toContain("not yet available for signature");

    // The gate and the document must never disagree: a confirmation that no
    // longer binds to this reading renders as awaiting review, not as signable.
    const drifted: UploadedLeaseParse = { ...confirmed, sourceSha256: "f".repeat(64) };
    expect(textOf(buildUploadedLeaseProplaneHtml({ parse: drifted }))).toContain(
      "Awaiting manager review — not yet available for signature",
    );
  });

  it("distinguishes a manager-entered value from a machine-extracted one", () => {
    const parse = parseFixture();
    const withOverride: UploadedLeaseParse = {
      ...parse,
      review: { ...parse.review, overrides: { securityDeposit: "$3,000.00" } },
    };
    const text = textOf(buildUploadedLeaseProplaneHtml({ parse: withOverride }));
    expect(text).toContain("Confirmed by manager");
    expect(text).toContain("Entered by the manager during review.");
    // The extracted rent keeps its own, different label plus its page trace.
    expect(text).toContain("Extracted");
    expect(text).toMatch(/Source: page 2/);
  });

  it("states that the uploaded PDF remains the signed document", () => {
    const text = textOf(buildUploadedLeaseProplaneHtml({ parse: parseFixture() }));
    expect(text).toContain("The uploaded PDF remains the document that is signed and is retained unchanged.");
  });
});
