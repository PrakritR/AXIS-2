// @vitest-environment jsdom
//
// The public /sms-consent opt-in form island. A carrier reviewer must see a
// phone field next to an UNCHECKED consent checkbox, and consent must be
// optional (the page never gates anything). These lock that contract.

import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SmsOptInForm } from "@/app/(public)/sms-consent/sms-opt-in-form";

afterEach(cleanup);

describe("SmsOptInForm (public /sms-consent)", () => {
  it("renders a phone field and an unchecked consent checkbox", () => {
    render(<SmsOptInForm />);
    expect(screen.getByLabelText(/mobile phone number/i)).toBeTruthy();
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(false);
  });

  it("shows the verbatim A2P consent wording", () => {
    render(<SmsOptInForm />);
    const label = screen.getByText(/I agree to receive text messages from PropLane/i);
    expect(label.textContent ?? "").toContain(
      "I agree to receive text messages from PropLane about my rental application and account. " +
        "Msg & data rates may apply. Message frequency varies. Reply STOP to opt out, HELP for help.",
    );
  });

  it("keeps opt-in disabled until a number is entered AND consent is checked", () => {
    render(<SmsOptInForm />);
    const submit = screen.getByRole("button", { name: /opt in to text messages/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/mobile phone number/i), {
      target: { value: "(206) 555-0100" },
    });
    expect(submit.disabled).toBe(true); // phone alone is not enough

    fireEvent.click(screen.getByRole("checkbox"));
    expect(submit.disabled).toBe(false);
  });

  it("confirms the opt-in on submit without claiming a message was sent", () => {
    render(<SmsOptInForm />);
    fireEvent.change(screen.getByLabelText(/mobile phone number/i), {
      target: { value: "(206) 555-0100" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /opt in to text messages/i }));
    expect(screen.getByText(/consent recorded/i)).toBeTruthy();
    expect(screen.getByText(/rental application and account/i)).toBeTruthy();
  });
});
