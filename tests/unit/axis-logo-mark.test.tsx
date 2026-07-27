// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AxisLogoLink, AxisLogoMark } from "@/components/brand/axis-logo";
import { PROPLANE_MARK_PATHS, PROPLANE_MARK_VIEWBOX_SIZE } from "@/lib/brand/proplane-mark";

afterEach(cleanup);

describe("AxisLogoMark", () => {
  it("renders the canonical PropLane mark geometry, not the retired paper-plane glyph", () => {
    const { container } = render(<AxisLogoMark />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe(`0 0 ${PROPLANE_MARK_VIEWBOX_SIZE} ${PROPLANE_MARK_VIEWBOX_SIZE}`);

    const paths = Array.from(container.querySelectorAll("path")).map((p) => p.getAttribute("d"));
    expect(paths).toEqual([...PROPLANE_MARK_PATHS]);
  });

  it("themes the stroke via the primary CSS variable instead of a hardcoded hex", () => {
    const { container } = render(<AxisLogoMark />);
    const themedGroup = container.querySelector("g.stroke-primary");
    expect(themedGroup).not.toBeNull();
    // No literal brand hex anywhere in the glyph markup.
    expect(container.innerHTML).not.toMatch(/#2f6bff/i);
  });
});

describe("AxisLogoLink", () => {
  it("still renders the PropLane wordmark alongside the mark", () => {
    const { getByText } = render(<AxisLogoLink />);
    expect(getByText("PropLane")).toBeTruthy();
  });
});
