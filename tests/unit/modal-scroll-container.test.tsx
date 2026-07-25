// @vitest-environment jsdom
//
// The Modal body is the one scroll container in both variants. The footer
// variant used to set `overflow-hidden` and rely on every child to hand-roll
// its own scroller — most didn't, so on phones everything below the fold was
// simply clipped and unreachable (no way to scroll to the remaining fields or
// even see them). These tests pin the body as scrollable so that class of bug
// cannot ship again.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Modal } from "@/components/ui/modal";

afterEach(cleanup);

function modalBody(): HTMLElement {
  const dialog = screen.getByRole("dialog");
  // Panel children: header, body, (footer?)
  return dialog.children[1] as HTMLElement;
}

describe("Modal scroll container", () => {
  it("body scrolls when a footer is present (no overflow-hidden clipping)", () => {
    render(
      <Modal open title="Tall form" onClose={() => {}} footer={<button type="button">Save</button>}>
        <p>content</p>
      </Modal>,
    );
    const body = modalBody();
    expect(body.className).toContain("overflow-y-auto");
    expect(body.className).not.toContain("overflow-hidden");
    // Children that pin an inner scroll region still need the flex column chain.
    expect(body.className).toContain("flex-col");
  });

  it("body scrolls without a footer too", () => {
    render(
      <Modal open title="Simple" onClose={() => {}}>
        <p>content</p>
      </Modal>,
    );
    expect(modalBody().className).toContain("overflow-y-auto");
  });
});
