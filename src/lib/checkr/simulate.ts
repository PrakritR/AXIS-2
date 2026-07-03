/**
 * Deterministic, no-network Checkr result derivation. Shared by the server
 * simulate fallback (`checkr/client.ts`, gated on `CHECKR_SIMULATE`) and the
 * client-side `/demo` sandbox simulation (`checkr/demo-simulate.ts`) so both
 * produce the same rule from the same input: odd final SSN digit → "consider",
 * otherwise → "clear". Pure — no env reads, safe to import from client code.
 */
import type { CheckrResult } from "@/lib/checkr/types";

export function stableHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function simulatedResult(ssn: string): CheckrResult {
  const digits = ssn.replace(/\D/g, "");
  const last = digits.length ? Number(digits[digits.length - 1]) : 0;
  return last % 2 === 1 ? "consider" : "clear";
}
