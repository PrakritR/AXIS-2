// @vitest-environment jsdom
//
// Full-thread scroll for the Communication thread pane (InboxThreadView).
//
// Two behaviours, and the `threadKey` prop is what separates them:
//
//  1. OPENING a conversation lands on the newest message — even when the new
//     thread happens to have the same message COUNT as the one it replaced.
//     The old effect keyed only on `messages.length`, so switching between two
//     equal-length threads never re-scrolled and the reader landed mid-history.
//  2. A message arriving in the SAME thread only follows the tail when the
//     reader is already near the bottom, so scrolling back through history is
//     never yanked forward.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { InboxThreadView } from "@/components/portal/portal-inbox-ui";

const scrollIntoView = vi.fn();

function msgs(prefix: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    author: "Jane Resident",
    body: `${prefix} message ${i}`,
    at: "9:00 AM",
    direction: "inbound" as const,
  }));
}

/** Pretend the bubble list overflows, with the reader at `scrollTop`. */
function stubThreadGeometry(container: HTMLElement, { scrollTop }: { scrollTop: number }) {
  const scroller = container.querySelector<HTMLElement>(".overflow-y-auto");
  if (!scroller) throw new Error("thread scroll container not found");
  Object.defineProperty(scroller, "scrollHeight", { value: 2000, configurable: true });
  Object.defineProperty(scroller, "clientHeight", { value: 500, configurable: true });
  Object.defineProperty(scroller, "scrollTop", { value: scrollTop, writable: true, configurable: true });
  scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
  return scroller;
}

beforeEach(() => {
  scrollIntoView.mockClear();
  // jsdom has no layout, so scrollIntoView is not implemented by default.
  Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
    value: scrollIntoView,
    writable: true,
    configurable: true,
  });
});
afterEach(() => cleanup());

describe("InboxThreadView full-thread scroll", () => {
  it("jumps to the newest message when the open thread changes, even at an identical message count", () => {
    const { rerender } = render(
      <InboxThreadView title="Sam Ortega" threadKey="thread-a" messages={msgs("a", 12)} />,
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "end" });

    scrollIntoView.mockClear();
    // Same length (12) — only `threadKey` differs.
    rerender(<InboxThreadView title="Riley Chen" threadKey="thread-b" messages={msgs("b", 12)} />);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "end" });
  });

  it("follows a new message when the reader is already at the bottom", () => {
    const { container, rerender } = render(
      <InboxThreadView title="Sam Ortega" threadKey="thread-a" messages={msgs("a", 12)} />,
    );
    // scrollHeight 2000 - scrollTop 1500 - clientHeight 500 = 0 -> pinned.
    stubThreadGeometry(container, { scrollTop: 1500 });
    scrollIntoView.mockClear();

    rerender(<InboxThreadView title="Sam Ortega" threadKey="thread-a" messages={msgs("a", 13)} />);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "end" });
  });

  it("does NOT yank the reader forward when a message arrives while they are reading history", () => {
    const { container, rerender } = render(
      <InboxThreadView title="Sam Ortega" threadKey="thread-a" messages={msgs("a", 12)} />,
    );
    // 2000 - 0 - 500 = 1500 px from the bottom -> reading history.
    stubThreadGeometry(container, { scrollTop: 0 });
    scrollIntoView.mockClear();

    rerender(<InboxThreadView title="Sam Ortega" threadKey="thread-a" messages={msgs("a", 13)} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
