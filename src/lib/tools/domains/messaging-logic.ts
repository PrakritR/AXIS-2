/**
 * Pure helpers for the gated send_resident_message tool. No database, no SDK —
 * the preview shown to the landlord is built here and unit-tested in isolation.
 */
import type { DemoApplicantRow } from "@/data/demo-portal";
import type { ActionPreview } from "../registry";

export type ResidentMessageInput = {
  residentEmail: string;
  subject: string;
  body: string;
  threadId?: string;
};

/**
 * The preview must show EXACTLY what will be sent — recipient resolved from the
 * landlord's own residents, the subject, and the FULL untruncated body — so the
 * landlord can catch an injection-induced or wrong message before confirming.
 */
export function buildResidentMessagePreview(
  resident: DemoApplicantRow,
  input: ResidentMessageInput,
  threadSubject?: string,
): ActionPreview {
  const email = String(resident.email ?? "").trim().toLowerCase();
  const warnings: string[] = [];
  if (/https?:\/\//i.test(input.body)) {
    warnings.push("The message body contains a link. Verify it before sending.");
  }
  const fields = [
    { label: "To", value: `${resident.name || "Resident"} <${email}>` },
    { label: "Subject", value: input.subject },
    { label: "Message", value: input.body },
  ];
  if (input.threadId) {
    fields.push({ label: "Reply in thread", value: threadSubject?.trim() || input.threadId });
  }
  return {
    kind: "send_message",
    title: `Send message to ${resident.name || email}`,
    confirmLabel: "Send message",
    fields,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
