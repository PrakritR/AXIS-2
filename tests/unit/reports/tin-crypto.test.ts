import { describe, expect, it } from "vitest";
import { encryptTin, decryptTin, tinLast4 } from "@/lib/reports/tin-crypto";

describe("reports/tin-crypto", () => {
  it("encrypts and decrypts TIN", () => {
    const plain = "12-3456789";
    const cipher = encryptTin(plain);
    expect(cipher).not.toContain("3456789");
    expect(decryptTin(cipher)).toBe(plain);
    expect(tinLast4(plain)).toBe("6789");
  });
});
