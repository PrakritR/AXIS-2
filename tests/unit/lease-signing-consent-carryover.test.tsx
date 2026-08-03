// @vitest-environment jsdom
//
// The e-signature affirmation must not outlive the document it was given for.
//
// Found while sweeping for the same class of bug as
// `uploaded-lease-attestation-carryover.test.tsx`. `agreed` correctly starts
// `false`, so there is no mount-time carryover — but `row` is LIVE in the
// resident portal (`resident-lease-panel.tsx` derives `pipelineRow` with
// `useMemo` off synced rows) and this modal renders the document straight from
// it. A resident who ticked the affirmation and then had the manager re-upload
// or regenerate the lease kept a ticked box against a document they never read,
// and Sign stayed enabled.
//
// `lease-execution-evidence.ts` hashes whatever is current at signature time,
// so it would have recorded that signature over the NEW document perfectly
// faithfully — the evidence layer cannot catch this, which is why the consent
// has to be dropped here.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { LeaseSigningModal } from "@/components/portal/lease-signing-modal";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";

function row(over: Partial<LeasePipelineRow> = {}): LeasePipelineRow {
  return {
    id: "lease-1",
    residentName: "Dana Reyes",
    residentEmail: "dana@example.com",
    unit: "Unit 4B",
    stageLabel: "Resident signature pending",
    updated: "today",
    bucket: "review" as LeasePipelineRow["bucket"],
    pdfVersion: 1,
    notes: "",
    updatedAtIso: "2026-08-01T10:00:00.000Z",
    thread: [],
    generatedHtml: "<p>Lease A</p>",
    generatedAtIso: "2026-08-01T09:00:00.000Z",
    ...over,
  };
}

function renderModal(r: LeasePipelineRow) {
  return render(
    <LeaseSigningModal
      row={r}
      signerName="Dana Reyes"
      signerRoleLabel="Your full legal name"
      onSign={() => true}
      onClose={() => {}}
    />,
  );
}

function rerenderModal(rerender: (ui: React.ReactElement) => void, r: LeasePipelineRow) {
  rerender(
    <LeaseSigningModal
      row={r}
      signerName="Dana Reyes"
      signerRoleLabel="Your full legal name"
      onSign={() => true}
      onClose={() => {}}
    />,
  );
}

// Radix portals the dialog to `document.body`.
const consentBox = () => document.body.querySelector<HTMLInputElement>('input[type="checkbox"]');
const signBtn = () => document.body.querySelector<HTMLButtonElement>('[data-attr="lease-sign-confirm"]');

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("lease signing consent carryover", () => {
  it("drops the affirmation when the generated document is replaced", () => {
    const { rerender } = renderModal(row());

    fireEvent.click(consentBox()!);
    expect(consentBox()!.checked).toBe(true);
    expect(signBtn()!.disabled).toBe(false);

    // Manager regenerated the lease while the resident had it open.
    rerenderModal(rerender, row({ generatedHtml: "<p>Lease B</p>", generatedAtIso: "2026-08-01T16:00:00.000Z" }));

    expect(consentBox()!.checked).toBe(false);
    expect(signBtn()!.disabled).toBe(true);
  });

  it("drops the affirmation when an uploaded PDF replaces the generated lease", () => {
    const { rerender } = renderModal(row());

    fireEvent.click(consentBox()!);
    expect(consentBox()!.checked).toBe(true);

    rerenderModal(
      rerender,
      row({
        managerUploadedPdf: {
          dataUrl: "data:application/pdf;base64,JVBERi0xLjcK",
          fileName: "countersigned.pdf",
          uploadedAt: "2026-08-01T17:00:00.000Z",
        },
      }),
    );

    expect(consentBox()!.checked).toBe(false);
    expect(signBtn()!.disabled).toBe(true);
  });

  it("drops the affirmation when a different PDF is re-uploaded", () => {
    const uploaded = (fileName: string, uploadedAt: string) =>
      row({ managerUploadedPdf: { dataUrl: "data:application/pdf;base64,JVBERi0xLjcK", fileName, uploadedAt } });

    const { rerender } = renderModal(uploaded("lease-a.pdf", "2026-08-01T09:00:00.000Z"));

    fireEvent.click(consentBox()!);
    expect(consentBox()!.checked).toBe(true);

    rerenderModal(rerender, uploaded("lease-b.pdf", "2026-08-01T18:00:00.000Z"));

    expect(consentBox()!.checked).toBe(false);
  });

  it("keeps the affirmation across a sync that does not touch the document", () => {
    // The row re-syncs on a cadence. Clearing the box because a thread message
    // landed would be its own bug, so identity stays document-scoped.
    const { rerender } = renderModal(row());

    fireEvent.click(consentBox()!);
    expect(consentBox()!.checked).toBe(true);

    rerenderModal(
      rerender,
      row({
        stageLabel: "Resident signature pending (reminded)",
        updatedAtIso: "2026-08-01T12:00:00.000Z",
        thread: [{ role: "manager", body: "Reminder sent", atIso: "2026-08-01T12:00:00.000Z" }] as
          LeasePipelineRow["thread"],
      }),
    );

    expect(consentBox()!.checked).toBe(true);
    expect(signBtn()!.disabled).toBe(false);
  });
});
