import { describe, expect, it } from "vitest";
import {
  commitOtherRecipientToken,
  normalizePhoneE164,
  parseOtherRecipients,
  parseOtherRecipientTokens,
} from "@/lib/communication-other-recipients";

describe("parseOtherRecipients", () => {
  it("splits emails and phones", () => {
    const out = parseOtherRecipients("a@test.com, 5105794001; +1 (510) 555-1212\nb@x.io");
    expect(out.emails).toEqual(["a@test.com", "b@x.io"]);
    expect(out.phones).toEqual(["+15105794001", "+15105551212"]);
  });

  it("dedupes", () => {
    const out = parseOtherRecipients("a@test.com, A@test.com, 5105794001, +15105794001");
    expect(out.emails).toEqual(["a@test.com"]);
    expect(out.phones).toEqual(["+15105794001"]);
  });
});

describe("commitOtherRecipientToken", () => {
  it("commits email and phone into chips", () => {
    expect(commitOtherRecipientToken("prakrit@uw.edu")).toEqual({
      kind: "email",
      value: "prakrit@uw.edu",
      label: "prakrit@uw.edu",
    });
    expect(commitOtherRecipientToken("5103098345")).toEqual({
      kind: "phone",
      value: "+15103098345",
      label: "(510) 309-8345",
    });
  });

  it("rejects incomplete fragments", () => {
    expect(commitOtherRecipientToken("510")).toBeNull();
    expect(commitOtherRecipientToken("not-an-email")).toBeNull();
  });
});

describe("parseOtherRecipientTokens", () => {
  it("maps chips to send targets", () => {
    const out = parseOtherRecipientTokens([
      { kind: "email", value: "a@test.com", label: "a@test.com" },
      { kind: "phone", value: "+15103098345", label: "(510) 309-8345" },
    ]);
    expect(out).toEqual({ emails: ["a@test.com"], phones: ["+15103098345"] });
  });
});

describe("normalizePhoneE164", () => {
  it("normalizes US numbers", () => {
    expect(normalizePhoneE164("5105794001")).toBe("+15105794001");
    expect(normalizePhoneE164("+15105794001")).toBe("+15105794001");
  });
});
