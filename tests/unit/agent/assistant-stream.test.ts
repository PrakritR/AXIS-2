import { describe, expect, it } from "vitest";
import { assistantResponse } from "@/lib/agent/assistant-stream";

describe("assistant SSE transport", () => {
  it("keeps JSON compatibility when SSE was not requested", async () => {
    const response = assistantResponse(new Request("http://test/agent"), {
      reply: "Done.",
      toolTrace: [],
      sessionId: "session_1",
    });
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({ reply: "Done.", sessionId: "session_1" });
  });

  it("emits opaque pending actions and terminal metadata over SSE", async () => {
    const response = assistantResponse(
      new Request("http://test/agent", { headers: { Accept: "text/event-stream" } }),
      {
        reply: "Draft ready.",
        toolTrace: [{ tool: "send_message", ok: true }],
        sessionId: "session_1",
        archiveSaved: false,
        pendingAction: { id: "action_1", preview: { title: "Send" } },
      },
    );
    const body = await response.text();
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("event: meta");
    expect(body).toContain("event: delta");
    expect(body).toContain("event: pending_action");
    expect(body).toContain("event: done");
    expect(body).toContain('"archiveSaved":false');
    expect(body).not.toContain("confirmedInput");
  });
});
