// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InboxReplyChannelPicker,
  inboxReplyChannelsToMode,
  inboxReplyModeToChannels,
} from "@/components/portal/portal-inbox-ui";

afterEach(() => cleanup());

describe("inbox reply channel helpers", () => {
  it("maps booleans to mode and back", () => {
    expect(inboxReplyChannelsToMode(true, false)).toBe("email");
    expect(inboxReplyChannelsToMode(false, true)).toBe("sms");
    expect(inboxReplyChannelsToMode(true, true)).toBe("both");
    expect(inboxReplyModeToChannels("both")).toEqual({ viaEmail: true, viaSms: true });
  });
});

describe("InboxReplyChannelPicker", () => {
  it("renders email-only dropdown when SMS is unavailable", () => {
    render(
      <InboxReplyChannelPicker
        viaEmail
        viaSms={false}
        onViaEmailChange={vi.fn()}
        onViaSmsChange={vi.fn()}
        emailAvailable
        smsAvailable={false}
      />,
    );
    const select = screen.getByLabelText("Send via") as HTMLSelectElement;
    expect(select.value).toBe("email");
    expect(select.disabled).toBe(true);
  });

  it("offers email, sms, and both when both channels are available", () => {
    const onEmail = vi.fn();
    const onSms = vi.fn();
    render(
      <InboxReplyChannelPicker
        viaEmail
        viaSms={false}
        onViaEmailChange={onEmail}
        onViaSmsChange={onSms}
        emailAvailable
        smsAvailable
      />,
    );
    const select = screen.getByLabelText("Send via");
    expect(select).toHaveTextContent("Email");
    expect(select).toHaveTextContent("SMS");
    expect(select).toHaveTextContent("Email & SMS");

    fireEvent.change(select, { target: { value: "both" } });
    expect(onEmail).toHaveBeenCalledWith(true);
    expect(onSms).toHaveBeenCalledWith(true);
  });
});
