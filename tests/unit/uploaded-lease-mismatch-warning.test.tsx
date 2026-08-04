// @vitest-environment jsdom
//
// A lease page headed "Diego Morales / Cascade Lofts · Unit 2A" rendered a PDF
// naming a different tenant, that person's real personal email, a different
// property, a different room and a different rent — with Send fully enabled and
// no warning anywhere. The PDF's content was seeded data; the product bug was
// that nothing objected.
//
// The refusal itself is pinned in `lease-send-guards.test.ts`. This drives the
// real review modal, which is where the manager is told WHAT disagrees and
// where confirming becomes the explicit acknowledgement rather than a reflex.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { UploadedLeaseReviewModal } from "@/components/portal/uploaded-lease-review-modal";
import {
  buildUploadedLeaseParse,
  unreadUploadedLeaseParse,
  type UploadedLeaseParse,
} from "@/lib/uploaded-lease-extraction";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";

const WRONG_PARTY_PAGES = [
  [
    "RESIDENTIAL LEASE AGREEMENT",
    "This Lease is between The Pioneer (Landlord) and Shivansh Nikhra (Tenant).",
    "Tenant shall pay rent of $1,450.00 per month.",
  ].join("\n"),
];

const RIGHT_PARTY_PAGES = [
  [
    "RESIDENTIAL LEASE AGREEMENT",
    "This Lease is between Cascade Holdings LLC (Landlord) and Diego Morales (Tenant).",
    "Tenant shall pay rent of $1,050.00 per month.",
  ].join("\n"),
];

function parseOf(pages: string[]): UploadedLeaseParse {
  return buildUploadedLeaseParse({
    pages,
    fileName: "lease.pdf",
    sourceSha256: "a".repeat(64),
    extractedAtIso: "2026-08-01T10:00:00.000Z",
  });
}

function row(overrides: Partial<LeasePipelineRow> = {}): LeasePipelineRow {
  return {
    id: "lease-1",
    residentName: "Diego Morales",
    residentEmail: "diego.morales@example.com",
    unit: "Cascade Lofts · Unit 2A",
    stageLabel: "Manager review",
    updated: "today",
    bucket: "manager",
    pdfVersion: 1,
    notes: "",
    updatedAtIso: "2026-08-01T10:00:00.000Z",
    thread: [],
    signedRentLabel: "$1,050.00 / month",
    managerUploadedPdf: {
      dataUrl: "data:application/pdf;base64,JVBERi0xLjcK",
      fileName: "lease.pdf",
      uploadedAt: "2026-08-01T09:00:00.000Z",
    },
    ...overrides,
  };
}

function renderModal(parse: UploadedLeaseParse, r: LeasePipelineRow = row()) {
  return render(
    <UploadedLeaseReviewModal open row={r} parse={parse} onClose={() => {}} onConfirm={() => {}} onRetryRead={() => {}} />,
  );
}

// Radix portals the dialog to `document.body`, not RTL's container.
const panel = () => document.body.querySelector('[data-attr="uploaded-lease-mismatch"]');
const attestBox = () => document.body.querySelector<HTMLInputElement>('[data-attr="uploaded-lease-attest"]');
const rentInput = () =>
  document.body.querySelector<HTMLInputElement>('[data-attr="uploaded-lease-field-monthlyRent"]');
const shownText = () => document.body.textContent ?? "";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the review names what the document disagrees with", () => {
  it("shows each disagreeing term beside the record's own value", () => {
    renderModal(parseOf(WRONG_PARTY_PAGES));

    expect(panel()).not.toBeNull();
    const text = panel()!.textContent ?? "";
    expect(text).toContain("Shivansh Nikhra");
    expect(text).toContain("Diego Morales");
    expect(text).toContain("1,450.00");
    expect(text).toContain("$1,050.00 / month");
    // Named per term, not one lumped warning.
    expect(document.body.querySelector('[data-attr="uploaded-lease-mismatch-tenantName"]')).not.toBeNull();
    expect(document.body.querySelector('[data-attr="uploaded-lease-mismatch-monthlyRent"]')).not.toBeNull();
  });

  it("asks the manager to accept the differences, not merely that the terms are correct", () => {
    renderModal(parseOf(WRONG_PARTY_PAGES));

    expect(shownText()).toContain("I accept the differences listed above");
    expect(shownText()).not.toContain("The terms above are correct");
  });

  it("says nothing when the document agrees with the record", () => {
    renderModal(parseOf(RIGHT_PARTY_PAGES));

    expect(panel()).toBeNull();
    expect(shownText()).toContain("The terms above are correct");
  });

  it("clears a term from the warning as soon as the manager corrects it", () => {
    renderModal(parseOf(WRONG_PARTY_PAGES));

    expect(panel()!.textContent).toContain("1,450.00");
    fireEvent.change(rentInput()!, { target: { value: "$1,050.00" } });

    // The rent now agrees; the tenant still does not, so the panel stays.
    expect(panel()!.textContent).not.toContain("1,450.00");
    expect(panel()!.textContent).toContain("Shivansh Nikhra");
  });

  /**
   * The tick is a legal statement about a specific set of differences. Letting
   * it survive a change in that set would silently upgrade "I accept these
   * differences" into "the terms are correct" — the same class of bug as the
   * failed→parsed carryover, one level up.
   */
  it("unticks the attestation when the set of differences changes", () => {
    const { rerender } = render(
      <UploadedLeaseReviewModal
        open
        row={row()}
        parse={parseOf(WRONG_PARTY_PAGES)}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );

    fireEvent.click(attestBox()!);
    expect(attestBox()!.checked).toBe(true);

    // The record was corrected under the open review — the document now names
    // the right tenant, so the manager is being asked the STRONGER question.
    rerender(
      <UploadedLeaseReviewModal
        open
        row={row({ residentName: "Shivansh Nikhra" })}
        parse={parseOf(WRONG_PARTY_PAGES)}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );

    expect(attestBox()!.checked).toBe(false);
  });
});

describe("an upload nobody has read says so", () => {
  it("does not claim the document could not be structured", () => {
    renderModal(unreadUploadedLeaseParse("lease.pdf"));

    expect(document.body.querySelector('[data-attr="uploaded-lease-never-read"]')).not.toBeNull();
    expect(document.body.querySelector('[data-attr="uploaded-lease-unreadable"]')).toBeNull();
    expect(shownText()).toContain("Nobody has reviewed this document yet");
    expect(shownText()).not.toContain("could not be structured");
  });

  it("offers a way through — read it, or attest to having read it yourself", () => {
    renderModal(unreadUploadedLeaseParse("lease.pdf"));

    expect(document.body.querySelector('[data-attr="uploaded-lease-retry-read"]')?.textContent).toContain(
      "Read it now",
    );
    expect(attestBox()).not.toBeNull();
    expect(shownText()).toContain("I have read the original PDF myself");
  });
});
