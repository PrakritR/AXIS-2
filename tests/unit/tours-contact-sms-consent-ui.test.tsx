// @vitest-environment jsdom
//
// UI contract for the tours-contact SMS opt-in checkbox. These are the exact
// properties an A2P 10DLC / CTIA reviewer checks, so they are locked in here:
// unchecked by default, optional, standalone, discloses sender + STOP/HELP, and
// links to the Privacy Policy and Terms of Service.

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SmsConsentCheckbox } from "@/app/(public)/rent/tours-contact/page";

afterEach(cleanup);

describe("SmsConsentCheckbox", () => {
  it("renders unchecked by default (never pre-selected)", () => {
    render(<SmsConsentCheckbox checked={false} onChange={() => {}} inputId="c1" />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(false);
  });

  it("discloses sender, cadence, and STOP/HELP, and says consent is optional", () => {
    render(<SmsConsentCheckbox checked={false} onChange={() => {}} inputId="c2" />);
    const label = screen.getByText(/I agree to receive text messages from PropLane/i);
    const text = label.textContent ?? "";
    expect(text).toMatch(/Message frequency varies/i);
    expect(text).toMatch(/Message and data rates may apply/i);
    expect(text).toMatch(/Reply STOP to opt out/i);
    expect(text).toMatch(/HELP for help/i);
    expect(text).toMatch(/optional and not required/i);
  });

  it("links to the Privacy Policy (/privacy) and Terms of Service (/tos)", () => {
    render(<SmsConsentCheckbox checked={false} onChange={() => {}} inputId="c3" />);
    const privacy = screen.getByRole("link", { name: /Privacy Policy/i }) as HTMLAnchorElement;
    const tos = screen.getByRole("link", { name: /Terms of Service/i }) as HTMLAnchorElement;
    expect(privacy.getAttribute("href")).toBe("/privacy");
    expect(tos.getAttribute("href")).toBe("/tos");
  });

  it("reports the user's toggle through onChange (opt-in is an explicit action)", () => {
    const onChange = vi.fn();
    render(<SmsConsentCheckbox checked={false} onChange={onChange} inputId="c4" />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reflects the checked state when opted in", () => {
    render(<SmsConsentCheckbox checked onChange={() => {}} inputId="c5" />);
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  });
});
