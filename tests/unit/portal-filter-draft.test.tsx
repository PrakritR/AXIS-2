// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { useState, useRef } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  PortalFilterDeferProvider,
  usePortalFilterDraft,
  type PortalFilterDeferController,
} from "@/lib/portal-filter-draft";
import { FilterCheckboxList } from "@/components/portal/filter-field-lists";

const OPTIONS = [
  { value: "p0", label: "Property 0" },
  { value: "p1", label: "Property 1" },
];

function DraftHarness() {
  const controllerRef = useRef<PortalFilterDeferController | null>(null);
  const [applied, setApplied] = useState<string[]>([]);

  return (
    <PortalFilterDeferProvider controllerRef={controllerRef}>
      <p data-testid="applied">{applied.join(",") || "none"}</p>
      <DraftFields applied={applied} onApply={setApplied} />
      <button
        type="button"
        onClick={() => controllerRef.current?.commitAll()}
        data-testid="commit"
      >
        Commit
      </button>
    </PortalFilterDeferProvider>
  );
}

function DraftFields({
  applied,
  onApply,
}: {
  applied: string[];
  onApply: (next: string[]) => void;
}) {
  const [draft, setDraft] = usePortalFilterDraft(applied, onApply, []);
  return (
    <FilterCheckboxList options={OPTIONS} selected={draft} onChange={setDraft} dataAttr="draft-test" />
  );
}

describe("usePortalFilterDraft", () => {
  it("keeps edits in draft until commitAll", async () => {
    render(<DraftHarness />);
    expect(screen.getByTestId("applied")).toHaveTextContent("none");
    fireEvent.pointerDown(screen.getByText("Property 0"));
    expect(screen.getByTestId("applied")).toHaveTextContent("none");
    fireEvent.click(screen.getByTestId("commit"));
    await waitFor(() => {
      expect(screen.getByTestId("applied")).toHaveTextContent("p0");
    });
  });
});
