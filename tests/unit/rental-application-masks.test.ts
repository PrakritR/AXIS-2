import { describe, expect, it } from "vitest";
import { digitsOnly, formatMoneyBlur, maskPhoneInput, maskSsnInput } from "@/lib/rental-application/masks";

describe("rental-application masks", () => {
  it("masks phone input", () => {
    expect(maskPhoneInput("", "2065550142")).toBe("(206) 555-0142");
  });

  it("masks SSN input", () => {
    expect(maskSsnInput("123456789")).toBe("123-45-6789");
  });

  it("formats money blur", () => {
    expect(formatMoneyBlur("50000")).toBe("50,000");
    expect(digitsOnly("(206) 555-0142")).toBe("2065550142");
  });
});
