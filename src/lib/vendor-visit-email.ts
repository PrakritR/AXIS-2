/**
 * Vendor visit notification email content. Pure and shared by the client
 * preview (manager work orders panel) and the send route so the preview
 * always matches what is actually sent.
 */

export type VendorVisitEmailInput = {
  vendorName: string;
  workOrderTitle: string;
  propertyLabel: string;
  unit?: string;
  /** Human-readable visit time, e.g. "Jul 8, 2:30 PM". */
  visitLabel: string;
  description?: string;
  preferredArrival?: string;
};

export function buildVendorVisitEmail(input: VendorVisitEmailInput): { subject: string; body: string } {
  const unit = input.unit?.trim();
  const where = unit && unit !== "—" ? `${input.propertyLabel} · ${unit}` : input.propertyLabel;
  const subject = `Service visit scheduled: ${input.workOrderTitle} — ${where}`;
  const lines = [
    `Hi ${input.vendorName.trim() || "there"},`,
    "",
    "A service visit has been scheduled for you through Axis.",
    "",
    `Work order: ${input.workOrderTitle}`,
    `Property: ${where}`,
    `Visit time: ${input.visitLabel}`,
  ];
  if (input.preferredArrival?.trim()) lines.push(`Resident arrival preference: ${input.preferredArrival.trim()}`);
  if (input.description?.trim()) lines.push("", "Notes:", input.description.trim());
  lines.push("", "If this time doesn't work, reply to this email to coordinate a new time.", "", "Axis Portal");
  return { subject, body: lines.join("\n") };
}
