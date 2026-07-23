// @vitest-environment jsdom
//
// Thread-view primitives for the conversation inbox:
//  1. Every bubble carries a channel tag (Email today) — omnichannel-ready.
//  2. A long message renders in FULL (pre-wrap, no clamp/truncate) so a reply
//     bubble never clips.
//  3. Scheduled messages render INLINE as a "Scheduled · sends <when>" card
//     with Cancel / Send now actions, replacing the standalone Schedule table.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  InboxBubble,
  InboxScheduledCard,
  type InboxBubbleMessage,
} from "@/components/portal/portal-inbox-ui";

afterEach(cleanup);

const LONG = "This is a very long reply ".repeat(40).trim();

describe("inbox thread omnichannel primitives", () => {
  it("tags each bubble with its channel and renders the full body", () => {
    const msg: InboxBubbleMessage = {
      id: "m1",
      author: "Dana",
      body: LONG,
      at: "Jul 20",
      direction: "inbound",
      channel: "email",
    };
    render(<InboxBubble message={msg} />);
    expect(screen.getByText("Email")).toBeTruthy();
    // The complete text is present (not clipped to a preview).
    const body = screen.getByText(LONG);
    expect(body).toBeTruthy();
    expect(body.className).not.toMatch(/line-clamp|truncate/);
  });

  it("defaults an untagged bubble to the Email channel", () => {
    render(<InboxBubble message={{ id: "m2", author: "X", body: "hi", at: "now", direction: "outbound" }} />);
    expect(screen.getByText("Email")).toBeTruthy();
  });

  it("renders a scheduled message inline with cancel + send-now actions", () => {
    const onCancel = vi.fn();
    const onSendNow = vi.fn();
    render(
      <InboxScheduledCard
        sendLabel="Jul 25, 2026, 9:00 AM"
        subject="Rent reminder"
        body={LONG}
        source="manual"
        editable
        onCancel={onCancel}
        onSendNow={onSendNow}
      />,
    );
    expect(screen.getByText(/Scheduled · sends Jul 25/)).toBeTruthy();
    // Full scheduled body is shown, not truncated.
    expect(screen.getByText(LONG)).toBeTruthy();
    fireEvent.click(screen.getByText("Cancel send"));
    fireEvent.click(screen.getByText("Send now"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSendNow).toHaveBeenCalledTimes(1);
  });
});
