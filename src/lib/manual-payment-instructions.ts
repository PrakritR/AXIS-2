import type { HouseholdCharge } from "@/lib/household-charges";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { generatePaymentReference, generateWorkOrderPaymentReference } from "@/lib/payment-reference";

export function chargePaymentReference(charge: Pick<HouseholdCharge, "id" | "paymentReference">): string {
  return charge.paymentReference?.trim() || generatePaymentReference(charge.id);
}

export function workOrderPaymentReference(workOrder: Pick<DemoManagerWorkOrderRow, "id" | "paymentReference">): string {
  return workOrder.paymentReference?.trim() || generateWorkOrderPaymentReference(workOrder.id);
}

/** Payment lines for vendor work-order payouts (Zelle/Venmo + WO- reference). */
export function buildWorkOrderPayoutInstructionLines(
  workOrder: Pick<DemoManagerWorkOrderRow, "id" | "paymentReference" | "cost" | "vendorCostCents" | "materialsCostCents"> & {
    zelleContactSnapshot?: string;
    venmoContactSnapshot?: string;
  },
  amountLabel: string,
): string[] {
  const ref = workOrderPaymentReference(workOrder);
  const lines: string[] = [];
  const zelle = workOrder.zelleContactSnapshot?.trim();
  const venmo = workOrder.venmoContactSnapshot?.trim();

  if (zelle || venmo) {
    lines.push("", "Pay with:");
    if (zelle) {
      lines.push(`• Zelle: send ${amountLabel ? `${amountLabel} to ` : "to "}${zelle}`);
      lines.push(`  Memo: ${ref}`);
    }
    if (venmo) {
      lines.push(`• Venmo: send ${amountLabel ? `${amountLabel} to ` : "to "}${venmo}`);
      lines.push(`  Note: ${ref}`);
    }
    lines.push("", "Include the reference code so the vendor can match this payment automatically.");
  } else if (ref) {
    lines.push("", `Payment reference: ${ref}`);
  }

  return lines;
}

/** Payment lines for reminders and resident-facing copy (Zelle/Venmo + PL- reference). */
export function buildManualPaymentInstructionLines(
  charge: Pick<
    HouseholdCharge,
    "id" | "paymentReference" | "zelleContactSnapshot" | "venmoContactSnapshot" | "balanceLabel" | "amountLabel"
  >,
): string[] {
  const ref = chargePaymentReference(charge);
  const amount = charge.balanceLabel?.trim() || charge.amountLabel?.trim() || "";
  const lines: string[] = [];
  const zelle = charge.zelleContactSnapshot?.trim();
  const venmo = charge.venmoContactSnapshot?.trim();

  if (zelle || venmo) {
    lines.push("", "You can pay with:");
    if (zelle) {
      lines.push(`• Zelle: send ${amount ? `${amount} to ` : "to "}${zelle}`);
      lines.push(`  Memo: ${ref}`);
    }
    if (venmo) {
      lines.push(`• Venmo: send ${amount ? `${amount} to ` : "to "}${venmo}`);
      lines.push(`  Note: ${ref}`);
    }
    lines.push("", "Include the reference code in your payment memo so we can match it automatically.");
  } else if (ref) {
    lines.push("", `Payment reference: ${ref}`);
  }

  return lines;
}

export function buildPaymentReminderBody(opts: {
  residentName: string;
  chargeTitle: string;
  balanceDue: string;
  dueDate: string;
  propertyLabel: string;
  managerName: string;
  manualPaymentLines?: string[];
}): string {
  const lines = [
    `Hi ${opts.residentName},`,
    "",
    `This is a friendly reminder that your ${opts.chargeTitle} payment is outstanding.`,
  ];
  if (opts.balanceDue) lines.push(`Amount due: ${opts.balanceDue}`);
  if (opts.dueDate) lines.push(`Due date: ${opts.dueDate}`);
  if (opts.propertyLabel) lines.push(`Property: ${opts.propertyLabel}`);

  if (opts.manualPaymentLines?.length) {
    lines.push(...opts.manualPaymentLines);
  } else {
    lines.push(
      "",
      "Please log in to your PropLane resident portal to make your payment at your earliest convenience.",
    );
  }

  lines.push(
    "",
    "If you have any questions, please don't hesitate to reach out.",
    "",
    opts.managerName,
    "PropLane Portal",
  );
  return lines.join("\n");
}

/** Append Zelle/Venmo pay-to lines when a charge has manual payment contacts. */
export function appendManualPaymentInstructions(body: string, charge: Parameters<typeof buildManualPaymentInstructionLines>[0]): string {
  const hasManual =
    Boolean(charge.zelleContactSnapshot?.trim()) || Boolean(charge.venmoContactSnapshot?.trim());
  if (!hasManual) return body;
  const extra = buildManualPaymentInstructionLines(charge);
  if (!extra.length) return body;
  const closing = "\n\nIf you have any questions, please don't hesitate to reach out.";
  if (body.includes("If you have any questions")) {
    return body.replace(closing, `${extra.join("\n")}${closing}`);
  }
  return `${body.trim()}${extra.join("\n")}`;
}
