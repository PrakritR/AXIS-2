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

  it("renders a scheduled message COMPACT by default — summary only, no body/actions", () => {
    const { container } = render(
      <InboxScheduledCard
        sendLabel="Jul 25, 2026, 9:00 AM"
        subject="Rent reminder"
        body={LONG}
        source="manual"
        editable
        expanded={false}
        onToggleExpand={vi.fn()}
        onCancel={vi.fn()}
        onSendNow={vi.fn()}
        onSaveEdit={vi.fn()}
      />,
    );
    // Compact summary row is present and clickable to expand…
    expect(container.querySelector('[data-attr="inbox-scheduled-toggle"]')).toBeTruthy();
    // …but the full body and actions are hidden until expanded (compact).
    expect(screen.queryByText(LONG)).toBeNull();
    expect(screen.queryByText("Send now")).toBeNull();
    expect(screen.queryByText("Cancel send")).toBeNull();
  });

  it("expanded, shows the full body and Cancel/Send-now actions that fire", () => {
    const onCancel = vi.fn();
    const onSendNow = vi.fn();
    render(
      <InboxScheduledCard
        sendLabel="Jul 25, 2026, 9:00 AM"
        subject="Rent reminder"
        body={LONG}
        source="manual"
        editable
        expanded
        onToggleExpand={vi.fn()}
        onCancel={onCancel}
        onSendNow={onSendNow}
        onSaveEdit={vi.fn()}
      />,
    );
    // Full scheduled body is shown, not truncated.
    expect(screen.getByText(LONG)).toBeTruthy();
    fireEvent.click(screen.getByText("Cancel send"));
    fireEvent.click(screen.getByText("Send now"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSendNow).toHaveBeenCalledTimes(1);
  });

  it("expanded + editable, Edit swaps to inline textareas and Save persists edits", () => {
    const onSaveEdit = vi.fn();
    render(
      <InboxScheduledCard
        sendLabel="Jul 25"
        subject="Rent reminder"
        body="Original body"
        source="manual"
        editable
        expanded
        onToggleExpand={vi.fn()}
        onCancel={vi.fn()}
        onSendNow={vi.fn()}
        onSaveEdit={onSaveEdit}
      />,
    );
    fireEvent.click(screen.getByText("Edit"));
    const bodyField = document.querySelector('[data-attr="inbox-scheduled-edit-body"]') as HTMLTextAreaElement;
    expect(bodyField).toBeTruthy();
    fireEvent.change(bodyField, { target: { value: "Edited body" } });
    fireEvent.click(screen.getByText("Save"));
    expect(onSaveEdit).toHaveBeenCalledTimes(1);
    expect(onSaveEdit.mock.calls[0][0]).toMatchObject({ body: "Edited body" });
  });
});
