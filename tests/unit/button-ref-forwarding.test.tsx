// @vitest-environment jsdom
//
// The shared Button forwards its ref WITHOUT a `forwardRef` wrapper: this repo is
// on React 19 (see the version assertion below), where a function component takes
// `ref` as an ordinary prop, so `ref` simply rides the props spread onto the
// rendered element. Two lanes independently implemented ref forwarding — one with
// `forwardRef`, one with the React 19 props-type form — so this locks in that the
// surviving form actually delivers a DOM node.
//
// What the real caller needs is specific: `useFieldSelectMenu`
// (`field-select-menu.tsx`) hands `buttonRef.current` to the menu geometry helpers
// and calls `.focus()` on it, and `portal-filter-sort-sheet.tsx:230` anchors its
// sheet off exactly that. A ref that resolves to null, or to a component instance
// rather than an element, breaks the anchoring silently at runtime — nothing here
// would fail to compile.
import { describe, expect, it, afterEach, vi } from "vitest";
import { createRef } from "react";
import * as React from "react";
import { render, cleanup } from "@testing-library/react";

vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

import { Button } from "@/components/ui/button";

afterEach(cleanup);

describe("Button ref forwarding", () => {
  it("is running on React 19, where ref-as-prop is the supported form", () => {
    // The premise of dropping `forwardRef`. If this ever fails, the props-type
    // ref below stops being forwarded and every anchored menu breaks.
    expect(Number.parseInt(React.version.split(".")[0]!, 10)).toBeGreaterThanOrEqual(19);
  });

  it("resolves the ref to the real <button> element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Filter</Button>);

    expect(ref.current).not.toBeNull();
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.tagName).toBe("BUTTON");
    expect(ref.current?.textContent).toBe("Filter");
  });

  it("gives the anchoring caller a node it can measure and focus", () => {
    // Exactly what `useFieldSelectMenu` does with `buttonRef.current`.
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Sort</Button>);

    expect(typeof ref.current?.getBoundingClientRect).toBe("function");
    expect(ref.current?.getBoundingClientRect()).toBeTruthy();
    ref.current?.focus();
    expect(document.activeElement).toBe(ref.current);
  });

  it("still forwards the ref when other props are passed alongside it", () => {
    // `ref` rides the same props spread as everything else, so a regression that
    // drops or reorders the spread would show up here.
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} type="button" variant="outline" className="custom-cls" data-attr="filter-open">
        Open
      </Button>,
    );

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.getAttribute("type")).toBe("button");
    expect(ref.current?.getAttribute("data-attr")).toBe("filter-open");
    expect(ref.current?.className).toContain("custom-cls");
  });

  it("forwards the ref through Radix Slot to the child element under asChild", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button asChild ref={ref}>
        {/* An external href keeps `@next/next/no-html-link-for-pages` quiet; the
            production use is `asChild` wrapping a next/link `<Link>`, which
            renders an anchor exactly like this one. */}
        <a href="https://example.com/portal">Go</a>
      </Button>,
    );

    // Slot renders the child, so the ref lands on the <a>, not a <button>.
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe("A");
    expect((ref.current as unknown as HTMLAnchorElement).getAttribute("href")).toBe(
      "https://example.com/portal",
    );
  });

  it("supports a callback ref as well as an object ref", () => {
    let node: HTMLButtonElement | null = null;
    render(<Button ref={(el) => { node = el; }}>Callback</Button>);

    expect(node).toBeInstanceOf(HTMLButtonElement);
  });
});
