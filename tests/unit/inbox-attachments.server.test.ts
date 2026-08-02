import { describe, expect, it } from "vitest";
import {
  inboxAttachmentServeUrl,
  normalizeInboxAttachmentUrls,
  userCanAccessInboxAttachment,
} from "@/lib/inbox-attachments.server";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function makeDb(tables: Tables) {
  const rowsFor = (table: string) => tables[table] ?? [];

  // Mirrors postgres `jsonb @> jsonb`: every key/element on the right must be
  // contained somewhere on the left, recursively.
  function jsonbContains(left: unknown, right: unknown): boolean {
    if (Array.isArray(right)) {
      if (!Array.isArray(left)) return false;
      return right.every((r) => left.some((l) => jsonbContains(l, r)));
    }
    if (right && typeof right === "object") {
      if (!left || typeof left !== "object" || Array.isArray(left)) return false;
      return Object.entries(right as Record<string, unknown>).every(([key, value]) =>
        jsonbContains((left as Record<string, unknown>)[key], value),
      );
    }
    return left === right;
  }

  function builder(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters.push((row) => String(row[col] ?? "") === String(val));
        return api;
      },
      ilike: (col: string, val: string) => {
        filters.push((row) => String(row[col] ?? "").toLowerCase() === String(val).toLowerCase());
        return api;
      },
      contains: (col: string, val: unknown) => {
        filters.push((row) => jsonbContains(row[col], val));
        return api;
      },
      limit: () => api,
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) => {
        const data = rowsFor(table).filter((row) => filters.every((f) => f(row)));
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return api;
  }

  return { from: (table: string) => builder(table) } as never;
}

describe("normalizeInboxAttachmentUrls", () => {
  const owner = "user-abc";
  const path = `${owner}/1700000000000-abc123.jpg`;
  const good = inboxAttachmentServeUrl(path);

  it("keeps canonical same-origin paths owned by the sender", () => {
    expect(normalizeInboxAttachmentUrls([good], owner)).toEqual([good]);
  });

  it("drops external and foreign-owner URLs", () => {
    const foreign = inboxAttachmentServeUrl(`other-user/${owner}/evil.jpg`);
    expect(
      normalizeInboxAttachmentUrls(
        ["https://evil.example/phish", foreign, "javascript:alert(1)"],
        owner,
      ),
    ).toEqual([]);
  });
});

describe("userCanAccessInboxAttachment", () => {
  const owner = "uploader-1";
  const recipient = "resident-2";
  const path = `${owner}/1700000000000-abc123.jpg`;
  const serveUrl = inboxAttachmentServeUrl(path);

  it("allows the uploader", async () => {
    const db = makeDb({});
    await expect(
      userCanAccessInboxAttachment(db, {
        userId: owner,
        userEmail: "uploader@example.com",
        path,
        isAdmin: false,
      }),
    ).resolves.toBe(true);
  });

  it("allows a conversation participant who received the attachment", async () => {
    const db = makeDb({
      portal_inbox_thread_records: [
        {
          owner_user_id: recipient,
          participant_email: null,
          row_data: {
            body: "See photo",
            messages: [{ body: "See photo", attachments: [{ url: serveUrl, name: "abc123.jpg" }] }],
          },
        },
      ],
    });
    await expect(
      userCanAccessInboxAttachment(db, {
        userId: recipient,
        userEmail: "resident@example.com",
        path,
        isAdmin: false,
      }),
    ).resolves.toBe(true);
  });

  it("allows a participant whose thread carries the attachment on the root turn", async () => {
    const db = makeDb({
      portal_inbox_thread_records: [
        {
          owner_user_id: "someone-else",
          participant_email: "resident@example.com",
          row_data: { body: "See photo", attachments: [{ url: serveUrl }] },
        },
      ],
    });
    await expect(
      userCanAccessInboxAttachment(db, {
        userId: recipient,
        userEmail: "Resident@Example.com",
        path,
        isAdmin: false,
      }),
    ).resolves.toBe(true);
  });

  it("denies unrelated managers without thread participation", async () => {
    const db = makeDb({
      portal_inbox_thread_records: [
        {
          owner_user_id: "other-resident",
          participant_email: null,
          row_data: { body: "no attachment here" },
        },
      ],
    });
    await expect(
      userCanAccessInboxAttachment(db, {
        userId: "manager-9",
        userEmail: "mgr@example.com",
        path,
        isAdmin: false,
      }),
    ).resolves.toBe(false);
  });

  it("denies an attacker who merely quotes the serve URL in their own message body", async () => {
    const db = makeDb({
      portal_inbox_thread_records: [
        {
          owner_user_id: "attacker-7",
          participant_email: null,
          row_data: {
            body: `Attachments:\n${serveUrl}`,
            messages: [{ body: `look: ${serveUrl}` }],
          },
        },
      ],
    });
    await expect(
      userCanAccessInboxAttachment(db, {
        userId: "attacker-7",
        userEmail: "attacker@example.com",
        path,
        isAdmin: false,
      }),
    ).resolves.toBe(false);
  });
});
