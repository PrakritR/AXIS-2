import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendInboxThreadReply } from "@/lib/portal-inbox-delivery";
import { makeWritableCtx } from "./tools/fake-agent-ctx";

/**
 * appendInboxThreadReply carries the ownership check that used to live inline
 * in the send-inbox-message route: only the thread's owner or its participant
 * may append; anything else is a silent no-op. These tests pin that behavior
 * now that both the route and the agent messaging tool call it.
 */

function makeDb(threads: Record<string, unknown>[]) {
  const { ctx, store } = makeWritableCtx({ portal_inbox_thread_records: threads });
  return { db: (ctx as unknown as { db: SupabaseClient }).db, store };
}

const baseOpts = {
  senderUserId: "manager_a",
  senderEmail: "manager@axis.test",
  fromName: "Axis Portal",
  text: "reply body",
};

describe("appendInboxThreadReply", () => {
  it("appends a message to a thread the sender owns", async () => {
    const { db, store } = makeDb([
      {
        id: "t1",
        owner_user_id: "manager_a",
        participant_email: null,
        scope: "axis_portal_inbox_manager_v1",
        row_data: { subject: "Rent", messages: [{ id: "m1", from: "Pat", body: "hi", at: "Jun 1" }] },
      },
    ]);
    const result = await appendInboxThreadReply(db, { ...baseOpts, threadId: "t1" });
    expect(result.ok).toBe(true);
    const rowData = store.portal_inbox_thread_records![0]!.row_data as {
      messages: unknown[];
      preview: string;
      unread: boolean;
    };
    expect(rowData.messages).toHaveLength(2);
    expect(rowData.preview).toBe("reply body");
    expect(rowData.unread).toBe(false);
  });

  it("appends when the sender is the thread participant (by email)", async () => {
    const { db, store } = makeDb([
      {
        id: "t1",
        owner_user_id: "someone_else",
        participant_email: "manager@axis.test",
        scope: "axis_portal_inbox_resident_v1",
        row_data: { messages: [] },
      },
    ]);
    const result = await appendInboxThreadReply(db, { ...baseOpts, threadId: "t1" });
    expect(result.ok).toBe(true);
    expect((store.portal_inbox_thread_records![0]!.row_data as { messages: unknown[] }).messages).toHaveLength(1);
  });

  it("is a no-op for a thread the sender neither owns nor participates in", async () => {
    const { db, store } = makeDb([
      {
        id: "t1",
        owner_user_id: "someone_else",
        participant_email: "other@example.com",
        scope: "axis_portal_inbox_manager_v1",
        row_data: { messages: [] },
      },
    ]);
    const result = await appendInboxThreadReply(db, { ...baseOpts, threadId: "t1" });
    expect(result.ok).toBe(false);
    expect((store.portal_inbox_thread_records![0]!.row_data as { messages: unknown[] }).messages).toHaveLength(0);
  });

  it("is a no-op for unknown or blank thread ids", async () => {
    const { db } = makeDb([]);
    expect((await appendInboxThreadReply(db, { ...baseOpts, threadId: "missing" })).ok).toBe(false);
    expect((await appendInboxThreadReply(db, { ...baseOpts, threadId: "  " })).ok).toBe(false);
  });
});
