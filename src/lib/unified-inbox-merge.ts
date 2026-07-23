/** Shared types for email + SMS rows in one Communication inbox list. */

export type UnifiedInboxChannel = "email" | "sms";

export type UnifiedInboxListItem = {
  /** Stable list key, e.g. `email:thread-id` or `sms:conversation-key`. */
  key: string;
  channel: UnifiedInboxChannel;
  threadId: string;
  name: string;
  subtitle?: string;
  preview: string;
  previewPrefix?: string;
  time: string;
  unread: boolean;
  /** Milliseconds since epoch for sort (higher = newer). */
  sortMs: number;
};

export function mergeUnifiedInboxItems(items: UnifiedInboxListItem[]): UnifiedInboxListItem[] {
  return [...items].sort((a, b) => b.sortMs - a.sortMs);
}

export function parseUnifiedInboxKey(key: string): { channel: UnifiedInboxChannel; threadId: string } | null {
  const idx = key.indexOf(":");
  if (idx <= 0) return null;
  const channel = key.slice(0, idx);
  if (channel !== "email" && channel !== "sms") return null;
  const threadId = key.slice(idx + 1);
  if (!threadId) return null;
  return { channel, threadId };
}

export function unifiedInboxKey(channel: UnifiedInboxChannel, threadId: string): string {
  return `${channel}:${threadId}`;
}

/** Filter SMS rows to match email folder tabs where it makes sense. */
export function smsItemMatchesInboxTab(
  tabId: string,
  item: UnifiedInboxListItem,
  opts?: { lastOutbound?: boolean },
): boolean {
  if (item.channel !== "sms") return false;
  if (tabId === "trash" || tabId === "schedule") return false;
  if (tabId === "sent") return Boolean(opts?.lastOutbound);
  if (tabId === "unopened") return item.unread;
  if (tabId === "opened") return !item.unread;
  return true;
}
