// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearResidentSignupNext,
  persistResidentSignupNext,
  readResidentSignupNext,
} from "@/lib/auth/resident-oauth-storage";

/**
 * `readResidentSignupNext()` feeds `window.location.replace()` directly on
 * `/auth/resident-oauth-finish` after a resident's Apple/Google OAuth signup
 * completes — the LAST hop before navigation, so it must reject an unsafe
 * value at both write and read time. This is the concrete regression for the
 * open-redirect bypass found in review: a tab/newline/CR-obfuscated
 * protocol-relative `next` (e.g. `?next=%2F%09%2Fevil.com`) passed the old
 * naive `startsWith("//")` check here and reached `location.replace`,
 * navigating the browser cross-origin.
 */
describe("resident-oauth-storage next-path safety", () => {
  beforeEach(() => {
    clearResidentSignupNext();
  });

  it("never persists a protocol-relative or obfuscated-protocol-relative next", () => {
    for (const unsafe of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/\r/evil.com"]) {
      persistResidentSignupNext(unsafe);
      expect(readResidentSignupNext()).toBeNull();
    }
  });

  it("still persists and returns a genuine same-origin path", () => {
    persistResidentSignupNext("/rent/apply?propertyId=mgr-qa-madison-9f3k2z");
    expect(readResidentSignupNext()).toBe("/rent/apply?propertyId=mgr-qa-madison-9f3k2z");
  });

  it("rejects a value written directly to storage by a hypothetical future caller that forgot to sanitize", () => {
    // Simulates a caller bypassing persistResidentSignupNext entirely — the
    // read-time check must be the backstop, not just the write-time one.
    window.sessionStorage.setItem("axis:resident-signup-next", "/\t/evil.com");
    expect(readResidentSignupNext()).toBeNull();
  });
});
