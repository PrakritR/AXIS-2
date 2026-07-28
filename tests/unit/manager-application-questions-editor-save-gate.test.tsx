// @vitest-environment jsdom
//
// Round 31 — the bulk Edit-application editor must NOT commit on every change. Edits stay
// local until an explicit Save; Cancel discards them; closing with pending changes prompts.
// These tests drive the real modal and assert the persist path is only ever hit on Save.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ManagerApplicationQuestionsEditorModal } from "@/components/portal/manager-application-questions-editor-modal";
import { createDefaultListingSubmission } from "@/lib/manager-listing-submission";

const persistBulk = vi.fn(() => ({ saved: 4, failed: 0 }));

vi.mock("@/lib/manager-property-save-target", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/manager-property-save-target")>();
  return {
    ...actual,
    persistApplicationConfigToPropertyIds: (...args: unknown[]) => persistBulk(...(args as [])),
    persistManagerListingSubmission: vi.fn(() => true),
  };
});

function renderEditor() {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(
    <ManagerApplicationQuestionsEditorModal
      open
      title="Edit application · 4 properties"
      sub={createDefaultListingSubmission()}
      propertyIds={["p1", "p2", "p3", "p4"]}
      managerUserId="mgr-1"
      onClose={onClose}
      onSaved={onSaved}
      showToast={() => {}}
    />,
  );
  return { onSaved, onClose };
}

function removeFirstQuestion() {
  const removeBtn = document.querySelector('[data-attr="application-question-remove"]') as HTMLElement | null;
  expect(removeBtn).not.toBeNull();
  fireEvent.click(removeBtn!);
}

beforeEach(() => {
  persistBulk.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("bulk application editor — save gate (round 31)", () => {
  it("does not persist on edit; Save is disabled until something changes", () => {
    renderEditor();
    const save = document.querySelector('[data-attr="application-questions-save"]') as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    // Expand a section so its per-question Remove controls are in the DOM, then remove one.
    const sectionToggle = document.querySelector('[data-attr^="application-section-toggle-"]') as HTMLElement;
    fireEvent.click(sectionToggle);
    removeFirstQuestion();

    // The edit changed nothing on disk.
    expect(persistBulk).not.toHaveBeenCalled();
    expect((document.querySelector('[data-attr="application-questions-save"]') as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("persists exactly once, across all properties, only when Save is confirmed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { onSaved, onClose } = renderEditor();

    fireEvent.click(document.querySelector('[data-attr^="application-section-toggle-"]') as HTMLElement);
    removeFirstQuestion();
    expect(persistBulk).not.toHaveBeenCalled();

    fireEvent.click(document.querySelector('[data-attr="application-questions-save"]') as HTMLElement);

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("4 properties"));
    expect(persistBulk).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Cancel with pending changes prompts, discards, and never persists", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { onSaved, onClose } = renderEditor();

    fireEvent.click(document.querySelector('[data-attr^="application-section-toggle-"]') as HTMLElement);
    removeFirstQuestion();

    // Two Cancel buttons exist in the DOM tree (footer); click the save-gate footer's Cancel.
    const cancelBtns = Array.from(document.querySelectorAll("button")).filter((b) => b.textContent === "Cancel");
    fireEvent.click(cancelBtns[cancelBtns.length - 1]!);

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("Discard"));
    expect(persistBulk).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
