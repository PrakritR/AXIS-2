import { afterEach, describe, expect, it } from "vitest";
import { isSmsCommUiEnabled } from "@/lib/sms-comm-ui-flag.server";

const ORIGINAL = process.env.SMS_COMM_UI_ENABLED;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SMS_COMM_UI_ENABLED;
  else process.env.SMS_COMM_UI_ENABLED = ORIGINAL;
});

describe("isSmsCommUiEnabled", () => {
  it("defaults OFF when unset (SMS hidden until A2P clears)", () => {
    delete process.env.SMS_COMM_UI_ENABLED;
    expect(isSmsCommUiEnabled()).toBe(false);
  });

  it("is ON only for an explicit 1/true", () => {
    process.env.SMS_COMM_UI_ENABLED = "1";
    expect(isSmsCommUiEnabled()).toBe(true);
    process.env.SMS_COMM_UI_ENABLED = "true";
    expect(isSmsCommUiEnabled()).toBe(true);
    process.env.SMS_COMM_UI_ENABLED = "TRUE";
    expect(isSmsCommUiEnabled()).toBe(true);
  });

  it("stays OFF for other values", () => {
    for (const v of ["0", "false", "", "no", "yes"]) {
      process.env.SMS_COMM_UI_ENABLED = v;
      expect(isSmsCommUiEnabled()).toBe(false);
    }
  });
});
