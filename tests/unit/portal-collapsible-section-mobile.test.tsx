// @vitest-environment jsdom
//
// Regression: on mobile, the Properties Preview section header squeezed the
// uppercase "Preview" label beside Send listing / Edit listing actions, truncating
// to "PREV" and overlapping the action row.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";

afterEach(cleanup);

describe("PortalCollapsibleSection mobile inline headers", () => {
  it("stacks inline header actions below the title on narrow viewports", () => {
    const { container } = render(
      <PortalCollapsibleSection
        title="Preview"
        titleVariant="label"
        headerActionsInline
        headerActions={
          <button type="button" data-attr="listing-send-listing">
            Send listing
          </button>
        }
      >
        <p>Listing preview body</p>
      </PortalCollapsibleSection>,
    );

    // The toggle attribute sits on the header row itself (it is the clickable
    // element), so assert on that node — not its parent, which is the section card.
    const header = container.querySelector('[data-attr="portal-section-toggle"]');
    expect(header?.className).toContain("flex-col");
    expect(header?.className).toContain("sm:flex-row");
    expect(screen.getByRole("button", { name: "Send listing" })).toBeTruthy();
  });
});
