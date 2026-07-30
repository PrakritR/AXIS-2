/**
 * Shared sign-in guidance for resident-facing email and inbox messages.
 */

import { residentPortalUrl } from "@/lib/claw-resident-links";

export type ResidentPortalLoginCopyOptions = {
  residentEmail?: string;
  /** Optional next step after the resident signs in. */
  afterLoginHint?: "lease" | "payments" | "general";
};

const LOGIN_MARKER = "Continue with Google";

export function residentPortalLoginInstructionLines(opts?: ResidentPortalLoginCopyOptions): string[] {
  const loginUrl = residentPortalUrl("login");
  const email = opts?.residentEmail?.trim();
  const lines = [
    "How to sign in to PropLane:",
    `• Open: ${loginUrl}`,
  ];
  if (email) {
    lines.push(
      `• Use the same email we have on file (${email}). Continue with Google usually works when that address is a Gmail account.`,
    );
  } else {
    lines.push(
      "• Use the same email address your property manager has on file. Continue with Google usually works when that email is a Gmail account.",
    );
  }
  lines.push(
    "• If your application is approved or you were added as a resident, your PropLane account is usually already set up for that email — sign in to continue (no new application needed).",
    "• Your manager can add or update details on your application later if anything is still missing.",
  );
  if (opts?.afterLoginHint === "lease") {
    lines.push("", "After sign-in, open Leases in the sidebar and complete your signature when you're ready.");
  } else if (opts?.afterLoginHint === "payments") {
    lines.push("", "After sign-in, open Payments to review charges and pay online.");
  } else if (opts?.afterLoginHint === "general") {
    lines.push("", "After sign-in, use the sidebar to open Payments, Leases, Maintenance, or your inbox.");
  }
  return lines;
}

export function residentPortalLoginInstructionBlock(opts?: ResidentPortalLoginCopyOptions): string {
  return residentPortalLoginInstructionLines(opts).join("\n");
}

/** Append login guidance when the body does not already include it. */
export function appendResidentPortalLoginInstructions(
  body: string,
  opts?: ResidentPortalLoginCopyOptions,
): string {
  const trimmed = body.trim();
  if (!trimmed) return residentPortalLoginInstructionBlock(opts);
  if (trimmed.includes(LOGIN_MARKER) && trimmed.includes(residentPortalUrl("login"))) return trimmed;
  return `${trimmed}\n\n${residentPortalLoginInstructionBlock(opts)}`;
}

/** Single-line placeholder for payment reminder templates. */
export function residentPortalLoginTemplatePlaceholder(): string {
  return "{residentPortalLogin}";
}

export function expandResidentPortalLoginTemplatePlaceholder(
  template: string,
  opts?: ResidentPortalLoginCopyOptions,
): string {
  if (!template.includes("{residentPortalLogin}")) return template;
  return template.replaceAll("{residentPortalLogin}", residentPortalLoginInstructionBlock(opts));
}

export function buildLeaseReadyForResidentMessage(opts: {
  residentName: string;
  residentEmail?: string;
  unit: string;
  variant?: "send" | "reminder";
  dateLine?: string;
}): string {
  const name = opts.residentName.trim() || "there";
  const unit = opts.unit.trim() || "your unit";
  const lines = [`Hi ${name},`, ""];
  if (opts.variant === "reminder") {
    lines.push(`This is a reminder to review and sign your lease for ${unit} in your PropLane resident portal.`);
  } else {
    lines.push(`Your lease for ${unit} is ready to review and sign in your PropLane resident portal.`);
  }
  if (opts.dateLine?.trim()) {
    lines.push("", opts.dateLine.trim());
  }
  lines.push(
    "",
    "If you have any questions before signing, reply in your PropLane inbox and we will help.",
    "",
    "PropLane",
  );
  return appendResidentPortalLoginInstructions(lines.join("\n"), {
    residentEmail: opts.residentEmail,
    afterLoginHint: "lease",
  });
}
