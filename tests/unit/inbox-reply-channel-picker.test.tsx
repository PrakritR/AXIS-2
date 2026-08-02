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
  it("always lists email and sms channels when sms is unavailable", () => {
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
    const trigger = screen.getByLabelText("Send via");
    expect(trigger).toHaveTextContent("Email");
    fireEvent.click(trigger);
    expect(screen.getByRole("option", { name: /SMS \(not enabled\)/i })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Email & SMS \(SMS off\)/i })).toBeTruthy();
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
    fireEvent.click(screen.getByLabelText("Send via"));
    fireEvent.pointerDown(screen.getByRole("option", { name: "Email & SMS" }));
    expect(onEmail).toHaveBeenCalledWith(true);
    expect(onSms).toHaveBeenCalledWith(true);
  });
});
