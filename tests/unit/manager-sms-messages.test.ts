import { describe, expect, it } from "vitest";
import type {
  ManagerSmsConversationsPayload,
  ManagerSmsMessageRow,
  ManagerSmsResidentConversation,
} from "@/lib/manager-sms-messages";
import {
  normalizeManagerSmsConversationsPayload,
  smsThreadBucketForLatestMessage,
  sortSmsConversationRows,
  MANAGER_SMS_TAB_DEFS,
} from "@/lib/manager-sms-messages";

describe("manager-sms-messages types", () => {
  it("accepts a conversations payload shape used by ManagerSmsPanel", () => {
    const message: ManagerSmsMessageRow = {
      id: "msg-1",
      direction: "inbound",
      body: "Hello manager",
      fromPhone: "+12065550100",
      toPhone: "+12065550999",
      messageSid: "SM123",
      source: "work_number",
      createdAt: "2026-07-16T12:00:00.000Z",
      storageTable: "inbound_sms_log",
    };
    const resident: ManagerSmsResidentConversation = {
      residentUserId: "user-1",
      residentEmail: "resident@test.axis.local",
      name: "Test Resident",
      phone: "+12065550100",
      propertyLabel: "Unit A",
      messages: [message],
    };
    const payload: ManagerSmsConversationsPayload = {
      workNumber: "+12065550999",
      personalPhone: null,
      phoneVerified: false,
      forwardInbound: false,
      smsConfigured: true,
      residents: [resident],
    };

    expect(payload.residents[0]?.messages[0]?.direction).toBe("inbound");
    expect(payload.workNumber).toBe("+12065550999");
  });

  it("normalizes missing residents and message arrays", () => {
    const payload = normalizeManagerSmsConversationsPayload({
      workNumber: "+12065550000",
      residents: [
        {
          residentUserId: null,
          residentEmail: "resident@test.axis.local",
          name: "",
          phone: null,
          propertyLabel: null,
          messages: undefined as unknown as ManagerSmsMessageRow[],
        },
      ],
    });
    expect(payload.residents).toHaveLength(1);
    expect(payload.residents[0]?.name).toBe("resident@test.axis.local");
    expect(payload.residents[0]?.messages).toEqual([]);
  });

  it("categorizes latest message into sms buckets", () => {
    const inbound: ManagerSmsMessageRow = {
      id: "msg-inbound",
      direction: "inbound",
      body: "Hi",
      fromPhone: "+12065550001",
      toPhone: "+12065550002",
      messageSid: null,
      source: "work_number",
      createdAt: "2026-07-16T12:00:00.000Z",
      storageTable: "inbound_sms_log",
    };
    const outbound: ManagerSmsMessageRow = {
      ...inbound,
      id: "msg-outbound",
      direction: "outbound",
    };
    expect(smsThreadBucketForLatestMessage(inbound, new Set())).toBe("unopened");
    expect(smsThreadBucketForLatestMessage(inbound, new Set(["msg-inbound"]))).toBe("opened");
    expect(smsThreadBucketForLatestMessage(outbound, new Set())).toBe("sent");
  });

  it("exposes all/unread tab defs for legacy routes", () => {
    expect(MANAGER_SMS_TAB_DEFS.map((t) => t.id)).toEqual(["all", "unopened"]);
  });

  it("sorts SMS threads by newest, name, and house", () => {
    const rows = [
      {
        resident: { name: "Zoe", propertyLabel: "B House", phone: "+1" },
        lastMessage: { createdAt: "2026-07-16T10:00:00.000Z" } as ManagerSmsMessageRow,
      },
      {
        resident: { name: "Amy", propertyLabel: "A House", phone: "+2" },
        lastMessage: { createdAt: "2026-07-15T10:00:00.000Z" } as ManagerSmsMessageRow,
      },
      {
        resident: { name: "Bob", propertyLabel: "A House", phone: "+3" },
        lastMessage: null,
      },
    ];
    expect(sortSmsConversationRows(rows, "newest").map((r) => r.resident.name)).toEqual(["Zoe", "Amy", "Bob"]);
    expect(sortSmsConversationRows(rows, "name").map((r) => r.resident.name)).toEqual(["Amy", "Bob", "Zoe"]);
    expect(sortSmsConversationRows(rows, "house").map((r) => r.resident.name)).toEqual(["Amy", "Bob", "Zoe"]);
  });
});
