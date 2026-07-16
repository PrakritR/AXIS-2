import type { PersistedInboxThread } from "@/lib/portal-inbox-storage";

/** True when a contact label looks like a phone number rather than a person/email. */
export function isPhoneLikeContact(value: string | null | undefined): boolean {
  const v = String(value ?? "").trim();
  if (!v || v.includes("@")) return false;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 10 && /^\+?[\d\s().-]+$/.test(v);
}

/** Inbox rows that belong in SMS (phone senders or SMS notice subjects). */
export function isSmsLikeInboxThread(thread: Pick<PersistedInboxThread, "from" | "email" | "subject">): boolean {
  if (isPhoneLikeContact(thread.from)) return true;
  if (isPhoneLikeContact(thread.email)) return true;
  const subject = String(thread.subject ?? "").toLowerCase();
  if (subject.includes("sms") && subject.includes("inbox")) return true;
  if (subject.includes("text from")) return true;
  return false;
}

/** Email-channel threads only (exclude SMS-like rows). */
export function filterEmailInboxThreads<T extends Pick<PersistedInboxThread, "from" | "email" | "subject">>(
  threads: T[],
): T[] {
  return threads.filter((thread) => !isSmsLikeInboxThread(thread));
}
