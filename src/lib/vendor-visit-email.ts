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
    "A service visit has been scheduled for you through PropLane.",
    "",
    `Work order: ${input.workOrderTitle}`,
    `Property: ${where}`,
    `Visit time: ${input.visitLabel}`,
  ];
  if (input.preferredArrival?.trim()) lines.push(`Resident arrival preference: ${input.preferredArrival.trim()}`);
  if (input.description?.trim()) lines.push("", "Notes:", input.description.trim());
  lines.push(
    "",
    "If this time doesn't work, reply to the PropLane text message or message us from your PropLane portal inbox to coordinate a new time.",
    "",
    "PropLane Portal",
  );
  return { subject, body: lines.join("\n") };
}

export type VendorAssignedEmailInput = {
  vendorName: string;
  workOrderTitle: string;
  propertyLabel: string;
  unit?: string;
  description?: string;
};

/** Assignment without a booked visit yet (no availability on file) — scheduling follows separately. */
export function buildVendorAssignedEmail(input: VendorAssignedEmailInput): { subject: string; body: string } {
  const unit = input.unit?.trim();
  const where = unit && unit !== "—" ? `${input.propertyLabel} · ${unit}` : input.propertyLabel;
  const subject = `New job assigned: ${input.workOrderTitle} — ${where}`;
  const lines = [
    `Hi ${input.vendorName.trim() || "there"},`,
    "",
    "You've been assigned a job through PropLane. A visit time hasn't been booked yet.",
    "",
    `Work order: ${input.workOrderTitle}`,
    `Property: ${where}`,
  ];
  if (input.description?.trim()) lines.push("", "Notes:", input.description.trim());
  lines.push(
    "",
    "Sign in to PropLane to see the details, or reply to the PropLane text message with times that work for you.",
    "",
    "PropLane Portal",
  );
  return { subject, body: lines.join("\n") };
}

export type VendorBidOfferEmailInput = {
  vendorName: string;
  workOrderTitle: string;
  propertyLabel: string;
  unit?: string;
  /** Human-readable scheduled tour time, if one was set before the bid offer. */
  visitLabel?: string;
  description?: string;
};

export function buildVendorBidOfferEmail(input: VendorBidOfferEmailInput): { subject: string; body: string } {
  const unit = input.unit?.trim();
  const where = unit && unit !== "—" ? `${input.propertyLabel} · ${unit}` : input.propertyLabel;
  const subject = `Bid requested: ${input.workOrderTitle} — ${where}`;
  const lines = [
    `Hi ${input.vendorName.trim() || "there"},`,
    "",
    "You're invited to submit a bid for a work order through PropLane.",
    "",
    `Work order: ${input.workOrderTitle}`,
    `Property: ${where}`,
  ];
  if (input.visitLabel?.trim()) lines.push(`Scheduled tour: ${input.visitLabel.trim()}`);
  if (input.description?.trim()) lines.push("", "Notes:", input.description.trim());
  lines.push("", "Sign in to PropLane and open Work Orders to submit your cost and availability.", "", "PropLane Portal");
  return { subject, body: lines.join("\n") };
}

export type VendorBidResultEmailInput = {
  vendorName: string;
  workOrderTitle: string;
  propertyLabel: string;
  unit?: string;
};

export function buildVendorBidAcceptedEmail(input: VendorBidResultEmailInput): { subject: string; body: string } {
  const unit = input.unit?.trim();
  const where = unit && unit !== "—" ? `${input.propertyLabel} · ${unit}` : input.propertyLabel;
  const subject = `Bid accepted: ${input.workOrderTitle} — ${where}`;
  const lines = [
    `Hi ${input.vendorName.trim() || "there"},`,
    "",
    `Your bid for "${input.workOrderTitle}" at ${where} was accepted. You're assigned at the agreed cost.`,
    "",
    "Sign in to PropLane for the work order details.",
    "",
    "PropLane Portal",
  ];
  return { subject, body: lines.join("\n") };
}

export function buildVendorBidDeclinedEmail(input: VendorBidResultEmailInput): { subject: string; body: string } {
  const unit = input.unit?.trim();
  const where = unit && unit !== "—" ? `${input.propertyLabel} · ${unit}` : input.propertyLabel;
  const subject = `Bid update: ${input.workOrderTitle} — ${where}`;
  const lines = [
    `Hi ${input.vendorName.trim() || "there"},`,
    "",
    `The manager selected another bid for "${input.workOrderTitle}" at ${where}. Thanks for submitting your bid.`,
    "",
    "PropLane Portal",
  ];
  return { subject, body: lines.join("\n") };
}
