import { residentPortalUrl } from "@/lib/claw-resident-links";

/** Default resident notice when a manager approves a service / amenity request. */
export function buildServiceRequestApprovedNotice(input: {
  residentName: string;
  offerName: string;
  price?: string;
  deposit?: string;
  propertyLabel?: string;
}): { subject: string; body: string } {
  const name = input.residentName.trim() || "there";
  const offer = input.offerName.trim() || "your service request";
  const subject = `Service request approved: ${offer}`;
  const lines = [
    `Hi ${name},`,
    "",
    `Your service request "${offer}" has been approved.`,
  ];
  if (input.propertyLabel?.trim()) lines.push(`Property: ${input.propertyLabel.trim()}`);
  if (input.price?.trim()) lines.push(`Charges: ${input.price.trim()}`);
  if (input.deposit?.trim() && input.deposit.trim() !== "0" && input.deposit.trim() !== "$0") {
    lines.push(`Deposit: ${input.deposit.trim()}`);
  }
  lines.push(
    "",
    `Review details and pay any fees: ${residentPortalUrl("services")}`,
    "",
    "Questions? Reply here or message us in your PropLane inbox.",
    "",
    "PropLane",
  );
  return { subject, body: lines.join("\n") };
}

/** Default resident notice when a manager denies a service / amenity request. */
export function buildServiceRequestDeniedNotice(input: {
  residentName: string;
  offerName: string;
  propertyLabel?: string;
}): { subject: string; body: string } {
  const name = input.residentName.trim() || "there";
  const offer = input.offerName.trim() || "your service request";
  const subject = `Service request update: ${offer}`;
  const lines = [
    `Hi ${name},`,
    "",
    `We're writing about your service request "${offer}".`,
    "Unfortunately we can't approve this request at this time.",
  ];
  if (input.propertyLabel?.trim()) lines.push(`Property: ${input.propertyLabel.trim()}`);
  lines.push(
    "",
    `View Services in your portal: ${residentPortalUrl("services")}`,
    "",
    "If you have questions, reply here or message us in PropLane.",
    "",
    "PropLane",
  );
  return { subject, body: lines.join("\n") };
}

/** Default resident notice when a manager completes a work order. */
export function buildWorkOrderCompletedNotice(input: {
  residentName: string;
  title: string;
  propertyLabel?: string;
  unit?: string;
  workDoneSummary?: string;
}): { subject: string; body: string } {
  const name = input.residentName.trim() || "there";
  const title = input.title.trim() || "Work order";
  const subject = `${title} completed`;
  const place = [input.propertyLabel?.trim(), input.unit?.trim()].filter(Boolean).join(" · ");
  const lines = [
    `Hi ${name},`,
    "",
    `Your work order "${title}"${place ? ` at ${place}` : ""} has been completed.`,
  ];
  if (input.workDoneSummary?.trim()) {
    lines.push("", `Summary: ${input.workDoneSummary.trim()}`);
  }
  lines.push(
    "",
    `View updates: ${residentPortalUrl("services")}`,
    "",
    "Questions? Reply here or message us in your PropLane inbox.",
    "",
    "PropLane",
  );
  return { subject, body: lines.join("\n") };
}
