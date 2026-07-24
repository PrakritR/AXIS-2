import { describe, expect, it } from "vitest";

import { sortUnifiedInboxItems, type UnifiedInboxListItem } from "@/lib/unified-inbox-merge";

function row(name: string, sortMs: number): UnifiedInboxListItem {
  return {
    key: `email:${name}`,
    channel: "email",
    threadId: name,
    name,
    preview: "",
    time: "",
    unread: false,
    sortMs,
  };
}

describe("sortUnifiedInboxItems", () => {
  it("sorts by most recent activity by default", () => {
    const sorted = sortUnifiedInboxItems([row("Zoe", 100), row("Alex", 500)], "recent");
    expect(sorted.map((r) => r.name)).toEqual(["Alex", "Zoe"]);
  });

  it("sorts alphabetically by resident display name", () => {
    const sorted = sortUnifiedInboxItems(
      [row("Zoe Nguyen", 900), row("Ava Park", 100), row("Mia Chen", 500)],
      "resident",
    );
    expect(sorted.map((r) => r.name)).toEqual(["Ava Park", "Mia Chen", "Zoe Nguyen"]);
  });
});
