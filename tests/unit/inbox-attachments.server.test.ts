import { describe, expect, it } from "vitest";
import {
  contentDispositionForInboxAttachmentPath,
  inboxAttachmentServeUrl,
  isInboxAttachmentPath,
  normalizeInboxAttachmentUrls,
  sanitizeInboxAttachmentFileName,
  userCanAccessInboxAttachment,
} from "@/lib/inbox-attachments.server";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function makeDb(tables: Tables) {
  const rowsFor = (table: string) => tables[table] ?? [];

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

describe("contentDispositionForInboxAttachmentPath", () => {
  // The bytes are attacker-supplied and served from the app's own origin, so an
  // inline disposition would render a PDF as a same-origin document. This must
  // stay type-BLIND: widening ALLOWED_MIME again must not be able to reopen it.
  it("is always attachment, never inline, for every allowed type", () => {
    for (const ext of ["pdf", "png", "jpg", "jpeg", "webp", "gif"]) {
      const cd = contentDispositionForInboxAttachmentPath(`user-1/123-uuid/report.${ext}`);
      expect(cd.startsWith("attachment;")).toBe(true);
      expect(cd).not.toContain("inline");
    }
  });

  it("cannot be broken out of by a crafted stored name", () => {
    const cd = contentDispositionForInboxAttachmentPath('user-1/123-uuid/a";\r\nX-Evil: 1.pdf');
    expect(cd).toBe('attachment; filename="a____X-Evil__1.pdf"');
    expect(cd).not.toMatch(/[\r\n]/);
    // Exactly the two quotes this helper adds — none smuggled in from the name.
    expect(cd.match(/"/g)).toHaveLength(2);
  });
});

describe("sanitizeInboxAttachmentFileName", () => {
  it("keeps the uploader's name so a PDF chip is not a UUID", () => {
    expect(sanitizeInboxAttachmentFileName("2026-lease-addendum.pdf", "pdf")).toBe(
      "2026-lease-addendum.pdf",
    );
  });

  it("keeps a non-final .pdf so extension-based readers still see the real type", () => {
    expect(sanitizeInboxAttachmentFileName("floorplan.pdf.png", "png")).toBe("floorplan.pdf.png");
  });

  it("never yields a traversal segment, separator, or empty name", () => {
    expect(sanitizeInboxAttachmentFileName("../../etc/passwd", "pdf")).toBe("passwd.pdf");
    expect(sanitizeInboxAttachmentFileName("..", "pdf")).toBe("attachment.pdf");
    expect(sanitizeInboxAttachmentFileName("", "pdf")).toBe("attachment.pdf");
    expect(sanitizeInboxAttachmentFileName("契約書", "pdf")).toBe("attachment.pdf");
    expect(sanitizeInboxAttachmentFileName("a/b\\c.pdf", "pdf")).toBe("c.pdf");
  });

  it("produces a path the serve route still accepts", () => {
    const name = sanitizeInboxAttachmentFileName("Q3 report (final).pdf", "pdf");
    expect(isInboxAttachmentPath(`user-1/123-uuid/${name}`)).toBe(true);
    expect(name).toMatch(/^[A-Za-z0-9._-]+$/);
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
          row_data: { body: `See photo ${serveUrl}` },
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
});
