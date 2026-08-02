// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ListingStickySubnav } from "@/components/marketing/listing-detail-subnav";

vi.mock("@/lib/portal-mobile-top-chrome", () => ({
  getPortalScrollRoot: () => null,
  syncPortalDetailDestinationOffset: () => 0,
  syncPortalMobileTopChrome: () => 0,
}));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ListingStickySubnav — portal property preview", () => {
  it("renders all section tabs from the start so labels are not center-clipped", () => {
    render(<ListingStickySubnav mode="portal" appearance="portal" />);

    const list = document.querySelector("[data-listing-subnav] ul");
    expect(list).not.toBeNull();
    expect(list?.className).toContain("justify-start");
    expect(document.querySelectorAll('[data-attr="listing-section-tab"]').length).toBe(6);
  });
});
