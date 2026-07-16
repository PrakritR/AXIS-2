import { describe, expect, it } from "vitest";
import {
  classifyManagerAgentCommand,
  managerAgentHelpMenuText,
  stripManagerAgentCommandWord,
} from "@/lib/claw-manager-intents";

describe("manager agent command word", () => {
  it("requires the agent prefix", () => {
    expect(stripManagerAgentCommandWord("mark Test Resident paid").isCommand).toBe(false);
    expect(stripManagerAgentCommandWord("agent mark Test Resident paid").isCommand).toBe(true);
    expect(stripManagerAgentCommandWord("AGENT: help").rest).toBe("help");
  });

  it("classifies mark paid with resident hint", () => {
    const c = classifyManagerAgentCommand("agent mark payment for Test Resident paid");
    expect(c.isCommand).toBe(true);
    expect(c.intent).toBe("mark_paid");
    expect(c.residentHint).toMatch(/Test Resident/i);
  });

  it("classifies mark paid without hint (open-thread mode)", () => {
    const c = classifyManagerAgentCommand("agent mark paid");
    expect(c.intent).toBe("mark_paid");
    expect(c.residentHint).toBeNull();
  });

  it("classifies lease link", () => {
    const c = classifyManagerAgentCommand("agent pull up link to lease for Jane Doe");
    expect(c.intent).toBe("lease_link");
    expect(c.residentHint).toMatch(/Jane Doe/i);
  });

  it("classifies help", () => {
    expect(classifyManagerAgentCommand("agent").intent).toBe("help");
    expect(classifyManagerAgentCommand("agent help").intent).toBe("help");
    expect(managerAgentHelpMenuText()).toMatch(/AGENT mark payment/i);
  });

  it("leaves normal manager texts alone", () => {
    const c = classifyManagerAgentCommand("Please send a message to resident saying that I am working on request");
    expect(c.isCommand).toBe(false);
  });
});
