import { describe, expect, it } from "vitest";
import { classifyResidentSmsIntent, residentHelpMenuText } from "@/lib/claw-resident-intents";
import {
  buildManagerResidentBrief,
  formatPendingChargesForSms,
} from "@/lib/claw-resident-actions.server";
import type { HouseholdCharge } from "@/lib/household-charges";

describe("classifyResidentSmsIntent", () => {
  it("maps toilet repair to maintenance / Services", () => {
    const c = classifyResidentSmsIntent("my toilet is broken can you fix");
    expect(c.intent).toBe("maintenance");
    expect(c.domain).toBe("Services");
    expect(c.managerPath).toContain("work-orders");
    expect(c.skipManagerBrief).toBe(false);
  });

  it("maps parking amenity language to service_request", () => {
    const c = classifyResidentSmsIntent("can I request reserved parking?");
    expect(c.intent).toBe("service_request");
    expect(c.managerPath).toContain("requests");
  });

  it("maps balance and pay asks", () => {
    expect(classifyResidentSmsIntent("how much do I owe?").intent).toBe("balance");
    expect(classifyResidentSmsIntent("I want to pay rent").intent).toBe("pay");
  });

  it("maps offline payment reports", () => {
    expect(classifyResidentSmsIntent("I paid via zelle").intent).toBe("i_paid");
    expect(classifyResidentSmsIntent("sent venmo for rent").intent).toBe("i_paid");
  });

  it("maps lease / applications / move-in", () => {
    expect(classifyResidentSmsIntent("where do I sign my lease?").intent).toBe("lease");
    expect(classifyResidentSmsIntent("application status?").intent).toBe("applications");
    expect(classifyResidentSmsIntent("when do I get my keys for move-in?").intent).toBe("move_in");
  });

  it("skips manager brief for help and greeting", () => {
    expect(classifyResidentSmsIntent("help").skipManagerBrief).toBe(true);
    expect(classifyResidentSmsIntent("hi").skipManagerBrief).toBe(true);
    expect(residentHelpMenuText()).toContain("PAY");
  });

  it("falls back to inbox/unknown for freeform chat", () => {
    const c = classifyResidentSmsIntent("thanks for everything yesterday");
    expect(c.intent).toBe("unknown");
    expect(c.domain).toBe("Inbox");
    expect(c.skipManagerBrief).toBe(false);
  });
});

describe("buildManagerResidentBrief", () => {
  it("includes said / wants / domain / open link", () => {
    const brief = buildManagerResidentBrief({
      residentName: "Test Resident",
      residentEmail: "resident@test.axis.local",
      residentPhone: "+15105791976",
      said: "my toilet is broken",
      wants: "file a maintenance work order",
      domain: "Services",
      managerPath: "/portal/services/work-orders",
      autoFiledNote: "PropLane auto-filed work order REQ-1 (Toilet issue).",
    });
    expect(brief).toContain('Resident Test Resident (resident@test.axis.local)');
    expect(brief).toContain('"my toilet is broken"');
    expect(brief).toContain("Wants: file a maintenance work order");
    expect(brief).toContain("Domain: Services");
    expect(brief).toContain("/portal/services/work-orders");
    expect(brief).toContain("REQ-1");
  });
});

describe("formatPendingChargesForSms", () => {
  it("lists charges and pay link", () => {
    const charges = [
      {
        id: "c1",
        title: "Rent — July",
        amountLabel: "$1,200.00",
        balanceLabel: "$1,200.00",
        dueDateLabel: "Jul 1",
        status: "pending",
      },
    ] as HouseholdCharge[];
    const text = formatPendingChargesForSms(charges);
    expect(text).toContain("Rent — July");
    expect(text).toContain("$1,200.00");
    expect(text).toContain("/resident/payments/pending");
  });

  it("handles empty list", () => {
    expect(formatPendingChargesForSms([])).toContain("No pending charges");
  });
});
